"""Run an extracted release, isolated from this source tree and from user data."""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path


def smoke(archive: Path):
    with tempfile.TemporaryDirectory(prefix="crease-release-") as directory:
        temp = Path(directory)
        with zipfile.ZipFile(archive) as zipped:
            for name in zipped.namelist():
                if not (temp / name).resolve().is_relative_to(temp.resolve()):
                    raise ValueError("Archive entry outside release root")
            zipped.extractall(temp)
        env = {**os.environ, "CREASE_DATA_DIR": str(temp / "isolated-data")}
        base = "http://127.0.0.1:8011"

        def get(path):
            with urllib.request.urlopen(base + path, timeout=10) as response:
                return response.read()

        with (temp / "server.log").open("w+") as log:
            process = subprocess.Popen(
                [sys.executable, "run.py", "--port", "8011"],
                cwd=temp / "crease-lab",
                env=env,
                stdout=log,
                stderr=log,
            )
            try:
                deadline = time.monotonic() + 25
                while time.monotonic() < deadline:
                    if process.poll() is not None:
                        log.seek(0)
                        raise RuntimeError(log.read())
                    try:
                        assert json.loads(get("/api/health"))["status"] == "ok"
                        break
                    except (urllib.error.URLError, TimeoutError):
                        time.sleep(0.25)
                else:
                    raise RuntimeError("Extracted release did not start in time")
                html = get("/").decode()
                asset = re.search(r'src="(/assets/[^\"]+\.js)"', html)
                assert asset and len(get(asset.group(1))) > 1000
                req = urllib.request.Request(
                    base + "/api/sessions/demo", method="POST", headers={"Origin": base}
                )
                with urllib.request.urlopen(req, timeout=20) as response:
                    session = json.load(response)
                assert len(session["state"]["deliveries"]) == 6
                assert get(f"/api/sessions/{session['id']}/frame/20").startswith(b"\xff\xd8")
                assert get(f"/api/sessions/{session['id']}/export.png").startswith(b"\x89PNG")
                print("Extracted release passed: startup, built assets, demo, frame, and export")
            finally:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("archive", nargs="?", type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    version = json.loads((root / "package.json").read_text())["version"]
    smoke(args.archive or root / "release" / f"crease-lab-{version}.zip")
