# Cricket Net Ball Tracking & Analysis
## Software Requirements Specification

Version 0.1 | 12 November 2026 | Status: proposed MVP baseline

This document combines the product SRS, a technology investigation summary, and a software architecture summary. Recommendations are design proposals, not results from an implemented or benchmarked system. The product name is a working title.

## 1. Purpose and product direction

Build a useful practice-analysis application from footage captured by one fixed camera at the bowler's end of a cricket net. The application tracks the visible ball, estimates where it pitches, overlays deliveries, and helps players and coaches assess line, length, and consistency.

The product should become useful before tracking is perfect. Manual correction, explicit uncertainty, and incremental improvement are core capabilities. A partially automated workflow is acceptable for the first release.

The initial audience is individual bowlers, coaches, and academies. International-team analysis is a possible future use case, not an initial performance or adoption requirement.

### 1.1 Success criteria

- A user can turn a recorded net session into a reviewable set of deliveries.
- Each retained delivery links video, an observed image-space trail, and an estimated or manually marked bounce location.
- A coach can compare bounce locations and target-zone consistency across selected deliveries.
- Failed tracking is visible and correctable; the system does not silently invent a complete track.
- New model versions can improve automation without destroying previous corrections.

### 1.2 Scope boundary

The MVP includes recorded-video upload, session setup, ground-plane calibration, delivery segmentation, assisted ball tracking, bounce review, pitch maps, same-view overlays, filtering, basic statistics, and exports.

Official DRS decisions, LBW predictions, edge detection, accurate full 3D trajectories, measured swing/seam, release speed, biomechanics, broadcast-video support, multi-camera capture, and live processing are outside the MVP. A video trail shows the projected image path; it is not a validated 3D measurement.

## 2. Users, assumptions, and workflow

### 2.1 Roles

- Player: records sessions, reviews deliveries, compares target accuracy.
- Coach/analyst: corrects tracks, labels sets, interprets patterns, exports results.
- Operator/developer: maintains processing jobs, model versions, and benchmark data.

The first implementation may be single-user on a local workstation. Shared accounts and permissions become requirements only if remote multi-user deployment is introduced.

### 2.2 Capture assumptions

- One stationary camera, safely mounted behind the bowler's end, with a clear view of the likely bounce region.
- One active delivery at a time in the selected net; unrelated movement may occur outside it.
- The operator records pitch dimensions and visible ground-marker coordinates rather than assuming all nets have standard geometry.
- A mostly planar practice surface supports ground-plane mapping. Uneven surfaces increase error.
- Footage is authorised for analysis. Ball colour, lighting, camera position, and resolution are recorded as session metadata.
- Proposed capture experiments compare 1080p and 4K, and 60/120 fps where available. These are candidates, not guaranteed minimum specifications. Short exposure and lighting matter independently of frame rate.

### 2.3 Primary workflow

1. Create a session and upload the original recording.
2. Check orientation, timestamps, visibility, and camera stability.
3. Mark the pitch region and at least four well-spaced, non-collinear ground reference points with known coordinates.
4. Define delivery intervals manually or accept automatic suggestions.
5. Process each interval: detect candidates, associate the ball across frames, and suggest a bounce.
6. Review flagged results; adjust points, bounce frame/location, and delivery boundaries.
7. Open pitch maps and video overlays; filter and compare deliveries.
8. Export approved results and save the session for later review.

## 3. Functional requirements

Priority: P0 = MVP required; P1 = next increment; P2 = future investigation. Each requirement is verifiable independently.

### 3.1 Capture and session management

- FR-01 [P0]: Import local MP4 recordings within a documented, tested codec profile. Reject unsupported media with an actionable reason and preserve the source file.
- FR-02 [P0]: Record session name, date, bowler label, bowling arm, ball colour, surface, capture settings where known, and notes. Allow unknown values.
- FR-03 [P0]: Show processing status, errors, and a retry action. Reloading the interface must not lose saved work.
- FR-04 [P0]: Allow manual creation, splitting, trimming, and removal of delivery intervals without editing the original recording.
- FR-05 [P1]: Suggest delivery intervals and let the user accept or correct them. Never treat segmentation as infallible.

### 3.2 Calibration and tracking

- FR-06 [P0]: Save a calibration containing image reference points, measured ground coordinates, units, pitch axes, lens correction metadata where available, and a version identifier. Reject degenerate point layouts.
- FR-07 [P0]: Show reference-point reprojection residuals and a calibration preview. Residuals are diagnostics, not proof of real-world accuracy.
- FR-08 [P0]: Detect and track ball candidates within a selected delivery and region of interest. Store frame index, presentation timestamp, image coordinates, confidence score, and point provenance.
- FR-09 [P0]: Mark each trail segment as observed, estimated across a short gap, manually supplied, or missing. Stop or flag tracks when association is ambiguous.
- FR-10 [P0]: Suggest a bounce event when supporting observations exist. Otherwise return unresolved. Permit manual bounce marking and full-toss/no-bounce classification.
- FR-11 [P0]: Convert the estimated ground-contact location to pitch coordinates using the applicable calibration. Correct for ball radius/contact geometry where justified, or include that approximation in validation error.
- FR-12 [P0]: Provide frame stepping, slow playback, track-point correction, bounce adjustment, undo, and explicit save. Preserve the original prediction separately from corrections.
- FR-13 [P1]: Detect camera displacement or allow the user to mark it. Flag affected deliveries and require a new calibration before combining their metric results.

### 3.3 Analysis and presentation

- FR-14 [P0]: Overlay the trail and bounce marker on individual delivery video. Distinguish observed and estimated segments visually and with a legend.
- FR-15 [P0]: Plot selected bounce locations on a top-down pitch map with labelled axes and units. Clicking a point opens its delivery.
- FR-16 [P0]: Overlay selected trails on the same camera view only when their geometry is compatible. Explain exclusions. Do not project airborne points into a top-down metric path.
- FR-17 [P0]: Filter by bowler, set, review status, and manually assigned delivery tags. Colour results by one selected attribute.
- FR-18 [P0]: Let users define target zones and report valid-delivery count, target hit rate, mean bounce position, and lateral/length spread. Show denominators and excluded/unresolved counts.
- FR-19 [P0]: Make line/length zones configurable. Define length as distance from the batter-end stump line toward the bowler; define lateral sign from the camera-facing-batter view. Store batter handedness before using off/leg labels.
- FR-20 [P0]: Export a pitch-map PNG and CSV containing delivery IDs, bounce coordinates, review status, provenance, and calibration/model versions. Include a short analysis summary in the UI.
- FR-21 [P1]: Export annotated video and a session PDF report after the basic analysis workflow is stable.
- FR-22 [P0]: Delete a session and its derived data through an explicit user action. State whether linked original files are retained; never delete an external original implicitly.

## 4. Non-functional requirements

- NFR-01 Accuracy transparency: Describe outputs as estimates. A model confidence score must not be presented as a calibrated probability or centimetre error bound unless validated as such.
- NFR-02 Responsiveness: Proposed UI target is under 300 ms for ordinary local interactions excluding media loading and processing. Measure on a declared reference workstation.
- NFR-03 Processing: Use asynchronous, per-delivery jobs. Publish measured throughput for the chosen hardware, resolution, and model. No real-time guarantee in the MVP.
- NFR-04 Reliability: Jobs must be retryable and idempotent. A failed job must not corrupt prior approved results. Persist corrections atomically.
- NFR-05 Reproducibility: Every result records source hash, pipeline/model version, settings, calibration version, and timestamps.
- NFR-06 Portability: Initial support is one documented Windows workstation configuration. Pin dependencies and maintain a reproducible environment.
- NFR-07 Privacy: Local storage is the default proposal. Do not upload recordings or reuse them for training without explicit opt-in. Remote deployment requires authentication, access controls, encrypted transport, and retention settings.
- NFR-08 Usability: Keyboard frame stepping, readable legends, non-colour status indicators, and visible save/review states are required.
- NFR-09 Maintainability: Keep detection, tracking, bounce estimation, geometry, and presentation behind separate interfaces so models can be replaced.
- NFR-10 Resource control: Preflight disk space, support configurable import limits, and clean temporary files after completed or cancelled jobs.

## 5. Limitations and mitigation plan

### 5.1 Small ball and motion blur

At the far end, the ball may occupy very few pixels. Tight framing, adequate resolution, short exposure, and good lighting improve visibility. Evaluate full-resolution crops rather than blindly shrinking frames. Higher frame rate improves temporal sampling but does not itself eliminate blur. The final supported capture profile must come from tests.

### 5.2 Occlusion and distracting motion

The bowler, batter, stumps, and netting can hide or resemble the ball. Use an elevated safe camera position, delivery windows, an appropriate region of interest, and temporal association. Bridge only short gaps under declared rules; mark estimates and reject unresolved bounce events. Manual correction is the fallback.

### 5.3 Bounce ambiguity

Contact may fall between frames; a ball-centre detection is above the surface even at contact. Use observations around the bounce, fit a local model, and assess sensitivity to frame and pixel errors. Permit manual review. A missed bounce must not become a fabricated pitch-map point.

### 5.4 Geometry and camera changes

A homography maps a plane, not arbitrary airborne positions [S1]. Use measured ground points for bounce mapping and a separate image-space trail for flight. Lens distortion, poorly placed markers, uneven surfaces, and tripod movement cause errors. Recalibrate after changes and keep metric comparisons tied to compatible coordinate definitions.

### 5.5 Generalisation

A model trained in one net may fail under different lighting, ball colours, surfaces, or devices. Expand capture conditions gradually, keep a separate held-out session benchmark, and track failure rates by condition. Do not advertise accuracy beyond tested conditions.

## 6. Technology investigation summary

This is a desk investigation informed by official documentation. No candidate has yet been benchmarked on project footage. The recommended approach is a hybrid pipeline with an inexpensive baseline before model training.

### 6.1 Video and geometry: Python + OpenCV

OpenCV provides camera calibration and projective geometry tools [S1], plus background subtraction for motion masks from static cameras [S2]. These support pitch calibration, frame preprocessing, candidate generation, and diagnostic visualisation. Background subtraction alone cannot reliably distinguish a ball from every other moving object.

Recommendation: use OpenCV for calibration, image operations, and the first motion/colour baseline. Test the chosen decoder against source presentation timestamps, especially variable-frame-rate or slow-motion recordings. Add a dedicated media decoder if timestamp fidelity or codec support requires it. OpenCV 4.5+ uses Apache 2.0 licensing according to its official license page [S3].

### 6.2 Detection: classical baseline versus learned detector

Baseline: motion masks, colour/size constraints, and short temporal associations. Advantages are fast implementation, low annotation cost, and interpretable failure cases. Weaknesses are changing light, blur, occlusion, and similarly coloured objects.

Learned candidate: fine-tune a small-object detector on representative net footage. TorchVision documents custom-dataset object-detection fine-tuning [S4]. Ultralytics is another candidate with convenient training/inference tooling, but its AGPL/commercial licensing options must fit the intended distribution; review the actual chosen code and weights before adoption [S5]. No architecture or pretrained weights should be assumed suitable for a tiny cricket ball without a benchmark.

Recommendation: build a detector adapter, benchmark the baseline, and train only when measured failures justify it. Retain difficult negatives, blurry balls, and partially occluded examples in the dataset.

### 6.3 Tracking and bounce estimation

Associate candidates using temporal proximity, plausible image-space movement, detection score, and delivery context. Compare a simple motion predictor with a Kalman-style baseline. A bounce is a motion discontinuity; do not smooth one continuous ballistic model across it. Optical flow may assist short gaps but can drift.

Recommendation: offline processing first, short-gap limits configurable, explicit missing states, and a reviewable bounce hypothesis. Full 3D inference and speed estimation remain separate research tasks.

### 6.4 Application stack

Proposed stack: React + TypeScript for video review and pitch maps; Python + FastAPI for typed application endpoints; a separate Python worker for CPU/GPU processing; SQLite for local metadata; filesystem storage for source media and derived artifacts. Use SVG or Canvas for maps and overlays. These are architectural choices, not proven performance claims.

Avoid adding a distributed queue, cloud platform, or microservices for the local MVP. A persisted SQLite job table and one worker are sufficient initially. Move to PostgreSQL, object storage, and a queue only if concurrent remote use warrants it.

### 6.5 Investigation experiments and decision gates

1. Capture feasibility: record around 50-100 deliveries across at least two sessions; inspect ball pixel size, blur, occlusion, and bounce visibility. Select a repeatable capture setup.
2. Geometry: place measured markers across the likely bounce region. Use independent check points not used to fit calibration; measure spatial error and sensitivity to camera movement.
3. Baseline: annotate delivery intervals, visible ball centres, and bounce events. Benchmark candidate detection, track completeness, bounce error, runtime, and manual correction time.
4. Learned model: if the baseline is inadequate, compare detectors on identical held-out sessions and the same hardware. Split by recording session, not adjacent frames, to reduce leakage.
5. Product gate: confirm that a coach can review a session faster with the tool than with manual video alone. Choose the next improvement from actual failure categories.

## 7. Software architecture summary

### 7.1 Component structure

Browser UI <-> Local API <-> SQLite metadata and job store

Local API -> Media filesystem

Worker -> Job store -> Media decode -> Detection -> Tracking -> Bounce estimation -> Ground mapping -> Versioned results

UI -> Review/correction API -> New correction revision -> Updated analysis views/exports

The API and worker may run as separate local processes. Bind to localhost by default. The UI should not run heavy inference in its request thread.

### 7.2 Responsibilities

- UI: upload, calibration editor, video timeline, point corrections, pitch map, filters, and job status.
- API: validate inputs, own metadata writes, resolve file identifiers, manage revisions, schedule jobs, and serve results.
- Worker: decode deterministically, run versioned inference stages, save intermediate diagnostics and immutable prediction outputs.
- Geometry module: lens correction, pitch axes, homography fitting, contact-point mapping, and calibration diagnostics.
- Analysis module: compute statistics only from eligible deliveries and retain exclusions in output.
- Export module: render maps and structured CSV from the same saved revision shown in the UI.

### 7.3 Data model

- Session: ID, metadata, timestamps, source-video references.
- VideoAsset: ID, path, content hash, codec metadata, dimensions, timebase, orientation.
- Calibration: ID/version, reference points, ground coordinates, transform, lens parameters, validity interval.
- Delivery: ID, session/video ID, start/end timestamps, labels, review state, calibration ID.
- TrackPoint: delivery/run ID, frame/timestamp, image x/y, score, observed/estimated/manual provenance.
- BounceEvent: delivery/run ID, frame/time estimate, image location, ground x/y when resolved, method, review status.
- ProcessingRun: pipeline/model versions, configuration, job state, timing, failure reason, immutable prediction artifacts.
- CorrectionRevision: author label, timestamp, prior revision, edited points/events, approval state.

Store raw observations and ground coordinates separately. Never overwrite a predicted point with a manual point without retaining provenance. In the MVP, large track arrays may be versioned JSON files with database references; session metadata and revision relations stay transactional.

### 7.4 Interfaces and job lifecycle

Example API groups: /sessions, /videos, /calibrations, /deliveries, /jobs, /revisions, /analysis, /exports. These are proposed resources, not a final endpoint contract.

Job lifecycle: queued -> running -> completed or failed; cancellation is a separate terminal state. Use a heartbeat to recover interrupted jobs. Key work by video hash, interval, calibration, model, and configuration versions so retries do not duplicate results. Changing calibration invalidates derived ground positions; changing review points invalidates affected statistics and exports.

The UI polls job progress initially. A queue or server events can be added later without changing the tracking interfaces.

## 8. Validation and acceptance

### 8.1 Required workflow checks

- AC-01: Import a supported recording, create a session, and reopen it with all saved metadata intact. Unsupported media produces a clear failure.
- AC-02: Calibrate using known points; reject collinear/degenerate input. Show independent check-point error separately from fit residuals.
- AC-03: Create and process a delivery; view timestamp-aligned observations and visibly marked gaps.
- AC-04: Correct a bounce and a track point, undo an edit, save, and reload. Original predictions remain recoverable.
- AC-05: Produce a pitch map whose selected point opens the correct clip. Full tosses and unresolved bounces are excluded from bounce statistics and counted separately.
- AC-06: Combine compatible same-view deliveries; reject or explain incompatible calibrations/views. Airborne points never enter ground-plane statistics.
- AC-07: Retry an interrupted job without losing corrections or duplicating deliveries.
- AC-08: CSV and PNG exports match the selected saved revision and include units, counts, and provenance where applicable.

### 8.2 Proposed pilot targets

These are starting targets for an agreed supported capture setup, not promised accuracy: at least 80% of deliveries yield an automatically proposed bounce; median ground-position error at most 0.30 m and 90th-percentile error at most 0.75 m among resolved predictions; median correction time at most 15 seconds per delivery needing correction. Revisit targets after the first benchmark and report achieved values even when targets are missed.

Report line and length errors separately, failed/unresolved rates, automatic versus corrected results, and sample counts. Annotation uncertainty must be recorded. Human inspection of the same low-frame-rate clip is not perfect ground truth; use measured targets and independent high-quality reference footage for a subset where possible.

Measure track quality on visible frames using a declared pixel or ball-radius tolerance. Report gap duration and false associations, not only detection scores. Benchmark runtime on named hardware and publish both processing time and human review time.

## 9. Delivery roadmap and risks

### Phase A: useful manual workflow

Import, clip intervals, calibration, manually marked bounces, pitch map, targets, CSV/PNG export. Exit when an end-to-end session can be saved, reviewed, and reproduced.

### Phase B: assisted tracking

Add baseline detector, temporal tracking, suggested bounce, review flags, and correction tooling. Exit when held-out benchmark results and coach review time are documented.

### Phase C: measured improvement

Train a detector where justified, expand capture conditions, add camera-movement checks and automatic segmentation, and improve exports. Add support profiles only after validation.

### Principal risks

- Footage is too blurry or the bounce is hidden: improve setup before increasing model complexity; retain manual workflow.
- Attractive overlays conceal bad geometry: validate with independent measured points and expose unresolved cases.
- Training data covers one environment: split by session and expand conditions deliberately.
- Feature scope expands toward DRS: keep 3D, speed, and umpiring behind separate research gates.
- Model/dependency licensing mismatches distribution: verify chosen packages and weights before release.
- Corrections are lost during reprocessing: immutable runs, versioned revisions, and explicit promotion of new results.

### Decisions still open

Actual camera/device, lighting and net geometry; acceptable pilot accuracy; reference workstation; initial dataset ownership; local packaging approach; eventual commercial distribution. None blocks building the manual workflow and collecting feasibility footage.

## 10. Sources and evidence notes

Sources checked 12 November 2026. Technical statements are grounded in the references below; stack selection, numerical targets, architecture, and roadmap are project proposals. No vendor accuracy claims are adopted.

- [S1] OpenCV, Camera Calibration and 3D Reconstruction: https://docs.opencv.org/4.13.0/d9/d0c/group__calib3d.html
- [S2] OpenCV, How to Use Background Subtraction Methods: https://docs.opencv.org/4.5.2/d1/dc5/tutorial_background_subtraction.html
- [S3] OpenCV, License: https://opencv.org/license/
- [S4] PyTorch, TorchVision Object Detection Finetuning Tutorial: https://docs.pytorch.org/tutorials/intermediate/torchvision_tutorial.html
- [S5] Ultralytics, Licensing: https://www.ultralytics.com/license
- [S6] ICC, Decision Review System overview: https://www.icc-cricket.com/about/cricket/rules-and-regulations/decision-review-system

S6 provides context for distinguishing this training application from formal match-officiating DRS. This specification does not claim ICC approval or officiating suitability.
