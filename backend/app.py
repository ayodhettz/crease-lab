import csv
import hashlib
import io
import os
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import uuid4

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .demo import create_demo
from .geometry import analyse, ground_point, transform
from .models import JobRequest, SaveRequest, SessionState
from .store import Store
from .tracking import PIPELINE_VERSION, track_video

ROOT = Path(__file__).resolve().parents[1]
MAX_UPLOAD = 2 * 1024**3


def inspect_video(path):
    cap = cv2.VideoCapture(str(path))
    try:
        ok, _ = cap.read()
        fps, frames = float(cap.get(cv2.CAP_PROP_FPS)), int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        width, height = (
            int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
            int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
        )
        if not ok or not 1 <= fps <= 300 or frames < 2 or width < 32 or height < 32:
            raise ValueError("Recording is not decodable. Use a constant-frame-rate MP4.")
        return {
            "fps": fps,
            "frames": frames,
            "width": width,
            "height": height,
            "duration": frames / fps,
            "timing": "nominal-cfr",
        }
    finally:
        cap.release()


def create_app(data_dir: Path | None = None):
    store = Store(data_dir or Path(os.getenv("CREASE_DATA_DIR", ROOT / "data")))
    pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="crease-tracker")

    @asynccontextmanager
    async def lifespan(app):
        yield
        pool.shutdown(wait=True, cancel_futures=False)

    app = FastAPI(title="Crease Lab", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "testserver"]
    )
    app.state.store = store

    @app.middleware("http")
    async def local_access(request: Request, call_next):
        # Same-origin writes only. Protect a localhost server from drive-by browser requests.
        origin = request.headers.get("origin")
        allowed = {f"http://{h}:5173" for h in ("localhost", "127.0.0.1")}
        if request.url.hostname in ("127.0.0.1", "localhost"):
            allowed.add(f"{request.url.scheme}://{request.url.netloc}")
        if request.method not in ("GET", "HEAD", "OPTIONS") and origin and origin not in allowed:
            return Response("Cross-origin writes are disabled", status_code=403)
        return await call_next(request)

    @app.exception_handler(KeyError)
    async def missing(request, exc):
        return Response("Resource not found", status_code=404)

    def validate_state(state: SessionState, video):
        if state.calibration:
            try:
                transform(state.calibration)
            except ValueError as exc:
                raise HTTPException(422, str(exc)) from exc
        for delivery in state.deliveries:
            if delivery.end >= video["frames"]:
                raise HTTPException(422, "Delivery interval exceeds the recording")
        return state.model_dump()

    def decorated(session):
        state = SessionState.model_validate(session["state"])
        return {**session, "analysis": analyse(state), "history": store.history(session["id"])}

    @app.get("/api/health")
    def health():
        return {"status": "ok", "version": "0.1.0", "pipeline": PIPELINE_VERSION}

    @app.get("/api/sessions")
    def sessions():
        return [
            {
                "id": s["id"],
                "name": s["state"]["name"],
                "updated": s["updated"],
                "deliveries": len(s["state"]["deliveries"]),
                "video": s["video"],
            }
            for s in store.list()
        ]

    @app.post("/api/sessions/import", status_code=201)
    def import_video(file: UploadFile):
        if not file.filename or Path(file.filename).suffix.lower() != ".mp4":
            raise HTTPException(422, "Choose an MP4 recording")
        filename = f"{uuid4().hex}.mp4"
        destination = store.media_path(filename)
        digest, size = hashlib.sha256(), 0
        try:
            with destination.open("wb") as target:
                while chunk := file.file.read(1024 * 1024):
                    size += len(chunk)
                    if size > MAX_UPLOAD:
                        raise HTTPException(413, "Recording exceeds the 2 GB import limit")
                    digest.update(chunk)
                    target.write(chunk)
            try:
                video = inspect_video(destination)
            except ValueError as exc:
                raise HTTPException(422, str(exc)) from exc
            video.update(
                {
                    "file": filename,
                    "name": Path(file.filename).name,
                    "hash": digest.hexdigest(),
                    "bytes": size,
                }
            )
            state = SessionState(name=Path(file.filename).stem).model_dump()
            return decorated(store.create(video, state))
        except Exception:
            destination.unlink(missing_ok=True)
            raise
        finally:
            file.file.close()

    @app.post("/api/sessions/demo", status_code=201)
    def demo():
        filename = f"{uuid4().hex}.mp4"
        destination = store.media_path(filename)
        try:
            state = create_demo(destination)
            video = inspect_video(destination)
            video.update(
                {
                    "file": filename,
                    "name": "synthetic-net.mp4",
                    "hash": hashlib.sha256(destination.read_bytes()).hexdigest(),
                    "bytes": destination.stat().st_size,
                    "synthetic": True,
                }
            )
            return decorated(store.create(video, state))
        except Exception:
            destination.unlink(missing_ok=True)
            raise

    @app.get("/api/sessions/{sid}")
    def session(sid: str):
        return decorated(store.get(sid))

    @app.put("/api/sessions/{sid}")
    def save(sid: str, body: SaveRequest):
        current = store.get(sid)
        payload = validate_state(body.state, current["video"])
        try:
            return decorated(store.save(sid, body.revision, payload))
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc

    @app.get("/api/sessions/{sid}/revisions/{revision}")
    def revision(sid: str, revision: int):
        import json

        store.get(sid)
        with store.db() as db:
            row = db.execute(
                "SELECT state FROM revisions WHERE session_id=? AND revision=?", (sid, revision)
            ).fetchone()
        if not row:
            raise HTTPException(404, "Revision not found")
        return {"state": json.loads(row["state"]), "revision": revision}

    @app.delete("/api/sessions/{sid}", status_code=204)
    def delete(sid: str):
        try:
            store.delete(sid)
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc

    @app.get("/api/sessions/{sid}/frame/{frame}")
    def frame(sid: str, frame: int):
        current = store.get(sid)
        if not 0 <= frame < current["video"]["frames"]:
            raise HTTPException(422, "Frame outside recording")
        cap = cv2.VideoCapture(str(store.media_path(current["video"]["file"])))
        try:
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame)
            ok, image = cap.read()
            if not ok:
                raise HTTPException(422, "Could not decode this frame")
            # Keep review requests manageable while preserving normalized coordinates.
            if image.shape[1] > 1600:
                image = cv2.resize(image, (1600, round(image.shape[0] * 1600 / image.shape[1])))
            ok, data = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 85])
            if not ok:
                raise HTTPException(500, "Could not encode frame")
            return Response(
                data.tobytes(),
                media_type="image/jpeg",
                headers={"Cache-Control": "private, max-age=86400"},
            )
        finally:
            cap.release()

    def process(jid):
        try:
            job = store.job(jid)
            store.update_job(jid, "running")
            snapshot = job["input"]
            delivery = snapshot["delivery"]
            result = track_video(
                store.media_path(snapshot["file"]),
                delivery["start"],
                delivery["end"],
                snapshot["seed"],
                snapshot["roi"],
                snapshot.get("calibration"),
            )
            store.update_job(jid, "completed", result=result)
        except Exception as exc:
            store.update_job(jid, "failed", error=str(exc))

    @app.post("/api/sessions/{sid}/jobs", status_code=202)
    def run_tracking(sid: str, body: JobRequest):
        current = store.get(sid)
        delivery = next(
            (d for d in current["state"]["deliveries"] if d["id"] == body.delivery_id), None
        )
        if not delivery:
            raise HTTPException(404, "Save the delivery before running tracking")
        if delivery["end"] - delivery["start"] > 3600:
            raise HTTPException(422, "Trim this delivery to at most 3600 frames before tracking")
        if body.seed and not delivery["start"] <= body.seed.frame <= delivery["end"]:
            raise HTTPException(422, "Seed must be inside the delivery")
        cal = current["state"]["calibration"]
        snapshot = {
            "file": current["video"]["file"],
            "source_hash": current["video"]["hash"],
            "revision": current["revision"],
            "delivery": delivery,
            "seed": body.seed.model_dump() if body.seed else None,
            # Ground-plane calibration does not bound the ball's airborne image path.
            "roi": None,
            "calibration": cal,
            "pipeline": PIPELINE_VERSION,
        }
        jid, created = store.create_job(sid, body.delivery_id, snapshot)
        if created:
            pool.submit(process, jid)
        return store.job(jid)

    @app.get("/api/sessions/{sid}/jobs")
    def jobs(sid: str):
        store.get(sid)
        return store.jobs(sid)

    @app.get("/api/sessions/{sid}/export.csv")
    def export_csv(sid: str):
        current = store.get(sid)
        state = SessionState.model_validate(current["state"])
        stream = io.StringIO(newline="")
        writer = csv.writer(stream)
        writer.writerow(
            [
                "delivery_id",
                "label",
                "bowler",
                "tag",
                "status",
                "bounce_frame",
                "lateral_m",
                "length_from_batter_m",
                "provenance",
                "revision",
                "calibration_revision",
                "source_sha256",
            ]
        )

        def safe(value):
            # Spreadsheet apps must not interpret user labels as formulas.
            return (
                "'" + value
                if isinstance(value, str) and value.startswith(("=", "+", "-", "@"))
                else value
            )

        for d in state.deliveries:
            xy = (
                ground_point(state.calibration, d.bounce.x, d.bounce.y)
                if state.calibration and d.bounce and d.bounce.ground_eligible
                else ["", ""]
            )
            writer.writerow(
                [
                    safe(d.id),
                    safe(d.label),
                    safe(d.bowler),
                    safe(d.tag),
                    d.status,
                    d.bounce.frame if d.bounce else "",
                    *xy,
                    d.bounce.provenance if d.bounce else "",
                    current["revision"],
                    current["revision"] if state.calibration else "",
                    current["video"]["hash"],
                ]
            )
        return Response(
            stream.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="crease-lab-deliveries.csv"'},
        )

    @app.get("/api/sessions/{sid}/export.png")
    def export_png(sid: str):
        current = store.get(sid)
        state = SessionState.model_validate(current["state"])
        if not state.calibration:
            raise HTTPException(422, "Calibrate the pitch before exporting a map")
        analysis = analyse(state)
        width, height, margin = 720, 1000, 85
        image = np.full((height, width, 3), (245, 247, 246), dtype="uint8")
        cv2.putText(
            image,
            "CREASE LAB / PITCH MAP",
            (45, 46),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            (40, 65, 50),
            2,
        )
        cal = state.calibration
        max_x = max([cal.width / 2 + 0.5, *(abs(p["x"]) + 0.2 for p in analysis["points"])])
        max_y = max([cal.length, *(p["y"] + 0.5 for p in analysis["points"])])
        min_y = min([0, *(p["y"] - 0.5 for p in analysis["points"])])

        def pixel(x, y):
            return (
                round(width / 2 + x / (2 * max_x) * (width - 2 * margin)),
                round(110 + (y - min_y) / (max_y - min_y) * (height - 220)),
            )

        cv2.rectangle(
            image, pixel(-cal.width / 2, 0), pixel(cal.width / 2, cal.length), (215, 229, 221), -1
        )
        t = state.target
        cv2.rectangle(image, pixel(t.x_min, t.y_min), pixel(t.x_max, t.y_max), (100, 160, 135), 2)
        for metre in range(0, int(cal.length) + 1, 2):
            cv2.line(
                image, pixel(-cal.width / 2, metre), pixel(cal.width / 2, metre), (187, 205, 194), 1
            )
            cv2.putText(
                image,
                f"{metre} m",
                (15, pixel(0, metre)[1] + 4),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.42,
                (70, 85, 80),
                1,
            )
        for index, p in enumerate(analysis["points"]):
            colour = (
                (80, 115, 225)
                if p["status"] == "reviewed"
                else (60, 160, 205)
                if p["status"] == "estimated"
                else (155, 155, 155)
            )
            cv2.circle(image, pixel(p["x"], p["y"]), 8, colour, -1)
            cv2.putText(
                image,
                str(index + 1),
                (pixel(p["x"], p["y"])[0] + 10, pixel(p["x"], p["y"])[1]),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.4,
                (50, 65, 60),
                1,
            )
        cv2.putText(
            image,
            "BATTER END / length measured toward bowler",
            (120, 85),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.46,
            (65, 85, 75),
            1,
        )
        summary = f"Rev {current['revision']} | Reviewed {analysis['reviewed']} | Auto {analysis['estimated']} | Excluded {analysis['excluded']}"
        cv2.putText(
            image, summary, (45, height - 65), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (65, 85, 75), 1
        )
        cv2.putText(
            image,
            "Reviewed: orange. Automatic estimates: amber. Unreviewed: grey.",
            (45, height - 35),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.43,
            (65, 85, 75),
            1,
        )
        _, data = cv2.imencode(".png", image)
        return Response(
            data.tobytes(),
            media_type="image/png",
            headers={"Content-Disposition": 'attachment; filename="crease-lab-pitch-map.png"'},
        )

    dist = ROOT / "frontend" / "dist"
    if dist.exists():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

        @app.get("/")
        def index():
            return FileResponse(dist / "index.html")

    return app


app = create_app()
