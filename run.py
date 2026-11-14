"""Launch the built local application. Install requirements.txt first."""

import argparse
from pathlib import Path

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run Crease Lab on this computer")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    if not (root / "frontend" / "dist" / "index.html").exists():
        raise SystemExit("Build the interface first: npm ci && npm run build")
    import uvicorn

    print(f"Crease Lab: http://127.0.0.1:{args.port} (Ctrl+C to stop)")
    uvicorn.run("backend.app:app", host="127.0.0.1", port=args.port)
