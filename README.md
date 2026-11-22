# Crease Lab

A local cricket-net analysis application for one fixed bowler-end camera. Import footage, review deliveries, mark ground contact, compare ball paths, and inspect a calibrated pitch map.

This development increment includes automatic ball tracking and bounce candidates. **Analyze delivery** tries to find a coloured ball, follows it, estimates a contact event, and shows its pitch-image location. For a calibrated fixed camera it also maps the contact into metres and estimates line/length. Automatic results are labelled estimates; manual corrections remain separate. The synthetic demo and supplied broadcast trial do not establish general real-footage accuracy.

## Run on this workstation

Dependencies and a production UI have already been installed and built in this working copy.

```powershell
.\start.ps1
```

Open http://127.0.0.1:8000 and choose **Explore the demo** or **Import a recording**. Keep the terminal open while using the app. Stop with Ctrl+C.

## Fresh setup

Use Python 3.12 and Node.js 24. The release archive already includes the built UI, so Node is needed only for development/rebuilding it.

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
npm ci
npm run build
.\.venv\Scripts\python.exe run.py
```

On macOS/Linux, use `python3.12 -m venv .venv` and `.venv/bin/python` instead of the Windows Python paths. Only Windows has been verified locally; CI is configured for Windows and Linux.

For development, run `python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000` with the virtual environment active, then `npm run dev` in another terminal. Vite serves the UI on port 5173 and proxies `/api` to the API. The built application uses one server on port 8000.

## A first session

1. Mount the camera safely behind the bowler's end. Keep it stationary and record a well-lit, constant-frame-rate MP4. The current import limit is 2 GB.
2. Import the recording. The application copies it to its managed media directory; the source is not modified.
3. Choose **Calibrate**. On a clearly visible frame, click four ground corners of a measured rectangle: far-left, far-right, near-right, near-left. Enter its actual width and length. The far edge represents the batter-end stump line for the reported length convention. If using a smaller reference rectangle, the current UI cannot encode an offset: place its far edge on that line. Defaults are examples, not measurements of your net.
4. Move to the beginning of a delivery and choose **Add delivery here**. Use **Set start here** and **Set end here** to trim its interval.
5. Choose **Analyze delivery**. A completed run loads the track and any supported bounce candidate into the unchanged draft and jumps to the contact frame. A calibrated fixed-view contact becomes an **Automatic estimate** in the pitch map and statistics. Save to retain the draft.
6. Review the candidate. If needed, use **Mark ball** to supply a visible colour seed and analyse again, or **Mark bounce** to correct the contact. Choose **Reviewed bounce** after checking it. Existing manual contact and point corrections are retained. If you edited while processing, use **Use analysis** to load the completed result explicitly.
7. Turn on **Overlay all** to compare the filtered deliveries on this fixed camera view. The pitch map shows ground contacts only. Click a map point or delivery row to open it.
8. Set target bounds, filter by bowler/review status, save, and export. CSV and PNG exports contain the entire saved session; the on-screen filters apply only to the view and statistics.

Arrow keys step one nominal source frame. Space toggles a sampled, silent frame preview, capped at approximately 12 requests per second. It is a review preview, not full-quality audiovisual playback. Explicit frame navigation and analysis operate on the original frame sequence.

## Included

- Durable SQLite sessions and immutable saved revisions, with optimistic concurrency protection.
- Original-file hash and per-run pipeline/input snapshots.
- MP4 import, per-frame decoding, delivery labels, bowler and set tags.
- Four-corner planar calibration and estimated ground coordinates.
- Manual ball/bounce annotations, undo, and restore-revision-as-draft.
- Image-space paths and same-camera overlays that leave missing frames disconnected.
- Automatic contact candidates, a contact-image preview, calibrated line/length estimates, target zones, and separate automatic/reviewed counts.
- Asynchronous single-worker tracking, queued/running/completed/failed states, retry by rerunning, and interrupted-run recovery.
- CSV export with formula-safe user labels, and a PNG session map.
- A generated synthetic demo, unit/API tests, browser workflow tests, and CI/CD configuration.

## Current limits

- No real net recording has been supplied or benchmarked. No measured tracking accuracy is claimed.
- Camera movement, lens distortion, rolling shutter, occlusion, and blur can bias results. Background-flow compensation is attempted, with diagnostics. Detected movement blocks automatic metric mapping; the source-image contact can still be shown. Lens correction and automatic ground calibration are not implemented. Recalibrate or create another session if the view changes.
- Calibration currently supports one measured rectangle for the whole recording. It validates convexity and numerical stability, but does not measure independent real-world check-point error.
- Timing assumes constant frame rate and uses the decoder's nominal FPS. Convert variable-frame-rate/phone slow-motion footage to a verified constant frame rate before analysis; automatic timing-profile validation is future work.
- The motion tracker can mistake hands, shadows, or nets for the ball. Automatic red-ball seeding and optional colour assistance remain experimental; white balls, similar-coloured objects, long occlusions, and cuts are failure cases. A sharp motion change is a bounce hypothesis and may also be a bat/other impact. Candidate scores are heuristics, not calibrated probabilities. Missing gaps are not drawn as observations.
- Ground-contact marks approximate the contact event. Marking the ball centre above the surface introduces additional error.
- No calibrated speed, swing, seam, 3D trajectory, LBW prediction, edge detection, automatic delivery segmentation, or officiating support.
- Multi-user hosting, authentication, automatic deployment, annotated-video exports, and model training are not part of this increment.

## Storage and architecture

The React/TypeScript interface talks to a FastAPI service. OpenCV handles media decoding, planar geometry, and the baseline tracker. SQLite stores session snapshots, revisions, and processing jobs. A single background worker handles tracking separately from requests; it never promotes suggestions into reviewed results.

Default storage is `data/` beside the source. Set `CREASE_DATA_DIR` before starting to choose another directory. Back up that whole directory while the application is stopped. Deleting a session deletes its imported copy, revisions, and job results; an external original recording is never deleted.

The service binds to localhost. It is intended for one user on one workstation. Keep this binding for the current version. Same-origin write checks are included, but this release is not a publicly hosted service.

See [TASKS.md](TASKS.md), [architecture decisions](docs/ARCHITECTURE.md), [CI/CD](docs/CI-CD.md), and the original [SRS](docs/SRS.md).

## Verify and package

With the Python virtual environment active:

```text
python -m ruff check backend tests scripts run.py
python -m ruff format --check backend tests scripts run.py
python -m pytest -q
npm run typecheck
npm test
npm run build
python -m scripts.make_fixture
npx playwright install chromium
npm run test:e2e
python scripts/package.py
```

The browser suite starts an isolated server and temporary data directory. Port 8000 must be free. The packaging script creates a built-UI/runtime-source archive and SHA-256 checksum under `release/`; no recordings, database, virtual environment, or node_modules are included.

## CI/CD

GitHub Actions workflows are in `.github/workflows/`. CI runs Python checks on Windows/Linux, frontend checks/build, a dependency audit, and Chromium end-to-end tests. A pushed `vX.Y.Z` tag runs CI again, checks that the tag matches `package.json`, packages the built app, uploads artifacts, and creates a **draft** GitHub release. Publishing the draft is a separate review step.

Source repository: [ayodhettz/crease-lab](https://github.com/ayodhettz/crease-lab) (private). Current pipeline results are available under [GitHub Actions](https://github.com/ayodhettz/crease-lab/actions). No hosting service is required for the local application.

Tracking changes, measured synthetic results and remaining limitations: [Tracking reliability](docs/TRACKING-RELIABILITY.md).

[Real fixed-camera validation](docs/FIXED-CAMERA-VALIDATION.md) exposes automatic acquisition failure and seeded identity drift on two external match clips. The automatic workflow is not yet validated on real footage; bounce-frame accuracy remains unestablished.
