# Implementation architecture

## Decisions for increment 0.1

The goal is a useful manual analysis loop that can accept better tracking later. The app uses React + TypeScript, FastAPI, OpenCV, and SQLite. It runs as one local web service with a separate background thread for offline processing. A distributed queue and microservices would add complexity without helping a single-workstation prototype.

```mermaid
flowchart LR
    UI[React review workspace] --> API[FastAPI local service]
    API --> DB[(SQLite sessions and revisions)]
    API --> Media[(Managed MP4 copies)]
    API --> Jobs[(Persisted job snapshots)]
    Jobs --> Worker[One processing worker]
    Worker --> Decode[OpenCV decode]
    Decode --> Detect[Motion candidates]
    Detect --> Track[Temporal association]
    Track --> Results[Suggestions]
    Results --> UI
    UI --> Review[Manual contact and review]
    Review --> API
    DB --> Map[Ground mapping and exports]
```

## Geometry contract

Image points are normalised to [0,1] in each axis, independent of preview image size. Ground x is metres left/right from the rectangle centre when facing the batter. Ground y is metres from the far/batter edge toward the bowler. The four reference corners map to `(-width/2,0)`, `(width/2,0)`, `(width/2,length)`, and `(-width/2,length)`.

Only bounce/contact locations are mapped into the ground plane. Airborne tracks remain image coordinates. A four-point transform fits the supplied corners exactly; its residual is not an independent accuracy measurement. This increment checks convexity/conditioning but leaves physical validation to measured check points and future tooling.

## Persistence contract

`sessions` contains the current state and revision. `revisions` stores every saved state immutably. Saves use an immediate SQLite transaction and the expected current revision; stale writes return HTTP 409. Restoring history loads a draft, and saving creates a new revision rather than deleting later history.

Each tracking job saves its input delivery, source SHA-256, calibration ROI, seed, input revision, and pipeline version. Results live on the job, separate from session state. The user can merge suggestions into a draft while retaining manual points. A later model can use the same result interface without rewriting the review workflow.

`data/media/` contains UUID-named imported copies. Clients never provide filesystem paths. Session deletion removes only app-owned copies and is blocked while a job is active. No automatic training-data collection occurs.

## Job lifecycle

Queued -> running -> completed/failed. The persisted job is created before work is submitted. A single worker bounds concurrent CPU use. An existing active job for the same delivery is reused. Process restart marks unfinished jobs as failed so the user can retry. Original predictions and manual corrections remain separate.

This is restart recovery, not distributed scheduling. Cancellation, heartbeat-based worker leases, global deduplication, and GPU scheduling are deferred. A queued/running job finishes before a graceful shutdown exits.

## Analysis contract

Statistics include only deliveries explicitly marked reviewed with a mapped bounce. Other deliveries are counted as exclusions. Standard deviations are population standard deviations; one reviewed point therefore has a spread of zero and is not evidence of established consistency. Filters affect displayed metrics/map/overlays; exports contain the whole saved session.

## Performance and future extension

Frame requests decode from a fresh capture and seek by nominal frame index. This is simple and works for manual review but may be slow for long-GOP/4K recordings. Thumbnail/frame caches and timestamp-aware decoding should be added after profiling. Playback is a sampled preview, not a high-FPS player.

The baseline detector is deliberately replaceable. Its fixed 0.35 score is a heuristic. It records no interpolated points and makes no bounce, speed, or 3D predictions. Add a trained detector only after an annotated real-footage benchmark identifies the biggest failures.

## Evidence

The design uses [OpenCV projective geometry](https://docs.opencv.org/4.13.0/d9/d0c/group__calib3d.html) and [FastAPI uploads](https://fastapi.tiangolo.com/tutorial/request-files/). Stack choices and architecture are project decisions. The original SRS contains the technology investigation and source list.
