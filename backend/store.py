import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4


def now():
    return datetime.now(timezone.utc).isoformat()


class Store:
    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        (root / "media").mkdir(exist_ok=True)
        with self.db() as db:
            db.executescript("""
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY, created TEXT NOT NULL, updated TEXT NOT NULL,
                    revision INTEGER NOT NULL, video TEXT NOT NULL, state TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS revisions (
                    session_id TEXT NOT NULL, revision INTEGER NOT NULL,
                    created TEXT NOT NULL, state TEXT NOT NULL,
                    PRIMARY KEY(session_id, revision));
                CREATE TABLE IF NOT EXISTS jobs (
                    id TEXT PRIMARY KEY, session_id TEXT NOT NULL, delivery_id TEXT NOT NULL,
                    created TEXT NOT NULL, updated TEXT NOT NULL, status TEXT NOT NULL,
                    input TEXT NOT NULL, result TEXT, error TEXT);
            """)
            db.execute(
                "UPDATE jobs SET status='failed', error='Processing interrupted; retry the delivery' "
                "WHERE status IN ('queued','running')"
            )

    @contextmanager
    def db(self):
        db = sqlite3.connect(self.root / "crease.sqlite", timeout=30)
        db.row_factory = sqlite3.Row
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def create(self, video, state):
        sid = uuid4().hex
        stamp = now()
        with self.db() as db:
            db.execute(
                "INSERT INTO sessions VALUES (?,?,?,?,?,?)",
                (sid, stamp, stamp, 0, json.dumps(video), json.dumps(state)),
            )
            db.execute("INSERT INTO revisions VALUES (?,?,?,?)", (sid, 0, stamp, json.dumps(state)))
        return self.get(sid)

    def get(self, sid):
        with self.db() as db:
            row = db.execute("SELECT * FROM sessions WHERE id=?", (sid,)).fetchone()
        if not row:
            raise KeyError(sid)
        result = dict(row)
        result["state"] = json.loads(result["state"])
        result["video"] = json.loads(result["video"])
        return result

    def list(self):
        with self.db() as db:
            rows = db.execute("SELECT id FROM sessions ORDER BY updated DESC").fetchall()
        return [self.get(row["id"]) for row in rows]

    def save(self, sid, revision, state):
        stamp = now()
        with self.db() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT revision FROM sessions WHERE id=?", (sid,)).fetchone()
            if not row:
                raise KeyError(sid)
            if row["revision"] != revision:
                raise ValueError("This session changed elsewhere. Reload before saving.")
            next_revision = revision + 1
            payload = json.dumps(state)
            db.execute(
                "UPDATE sessions SET revision=?,state=?,updated=? WHERE id=?",
                (next_revision, payload, stamp, sid),
            )
            db.execute(
                "INSERT INTO revisions VALUES (?,?,?,?)", (sid, next_revision, stamp, payload)
            )
        return self.get(sid)

    def history(self, sid):
        with self.db() as db:
            return [
                dict(r)
                for r in db.execute(
                    "SELECT revision,created FROM revisions WHERE session_id=? ORDER BY revision DESC",
                    (sid,),
                )
            ]

    def delete(self, sid):
        session = self.get(sid)
        with self.db() as db:
            active = db.execute(
                "SELECT 1 FROM jobs WHERE session_id=? AND status IN ('queued','running')", (sid,)
            ).fetchone()
            if active:
                raise ValueError("Wait for processing to finish before deleting this session")
            db.execute("DELETE FROM revisions WHERE session_id=?", (sid,))
            db.execute("DELETE FROM jobs WHERE session_id=?", (sid,))
            db.execute("DELETE FROM sessions WHERE id=?", (sid,))
        # Only the imported copy is owned by the app, never the user's original.
        self.media_path(session["video"]["file"]).unlink(missing_ok=True)

    def media_path(self, filename):
        path = (self.root / "media" / filename).resolve()
        if path.parent != (self.root / "media").resolve():
            raise ValueError("Invalid media identifier")
        return path

    def create_job(self, sid, delivery_id, snapshot):
        jid, stamp = uuid4().hex, now()
        with self.db() as db:
            db.execute("BEGIN IMMEDIATE")
            # One active run per delivery prevents accidental duplicate clicks.
            existing = db.execute(
                "SELECT id FROM jobs WHERE session_id=? AND delivery_id=? "
                "AND status IN ('queued','running')",
                (sid, delivery_id),
            ).fetchone()
            if existing:
                return existing["id"], False
            db.execute(
                "INSERT INTO jobs VALUES (?,?,?,?,?,?,?,?,?)",
                (jid, sid, delivery_id, stamp, stamp, "queued", json.dumps(snapshot), None, None),
            )
        return jid, True

    def job(self, jid):
        with self.db() as db:
            row = db.execute("SELECT * FROM jobs WHERE id=?", (jid,)).fetchone()
        if not row:
            raise KeyError(jid)
        value = dict(row)
        value["input"] = json.loads(value["input"])
        value["result"] = json.loads(value["result"]) if value["result"] else None
        return value

    def jobs(self, sid):
        with self.db() as db:
            ids = db.execute("SELECT id FROM jobs WHERE session_id=? ORDER BY created DESC", (sid,))
            return [self.job(r["id"]) for r in ids]

    def update_job(self, jid, status, result=None, error=None):
        with self.db() as db:
            db.execute(
                "UPDATE jobs SET status=?,result=?,error=?,updated=? WHERE id=?",
                (status, json.dumps(result) if result else None, error, now(), jid),
            )
