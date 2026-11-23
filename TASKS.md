# Implementation tasks

Working order: finish a reliable manual analysis loop before introducing automated suggestions. Each stage must preserve usable work from earlier stages.

## Current iteration

1. [x] Scaffold a local application, dependency manifests, and development commands.
2. [x] Implement durable sessions, video import, calibration, delivery boundaries, and versioned manual annotations.
3. [x] Build the review interface with frame navigation, ball trails, bounce marking, and correction controls.
4. [x] Build a calibrated pitch map, target-zone statistics, filters, CSV export, and PNG export.
5. [x] Add an offline motion-based tracking baseline with persisted jobs and explicit uncertainty.
6. [x] Add meaningful geometry, persistence, media, API, and browser workflow tests.
7. [x] Configure CI checks and CD release packaging, with a smoke-tested local launch path.
8. [x] Run the checks, inspect the interface, document known limitations, and package the first increment.

Completed 14 November 2026. See `docs/VALIDATION.md` for evidence and limitations. Repository: [ayodhettz/crease-lab](https://github.com/ayodhettz/crease-lab) (private).

9. [x] Create the private GitHub repository, push the initial version, and verify Windows/Linux/browser CI. [Initial passing run](https://github.com/ayodhettz/crease-lab/actions/runs/43574888901).

Version-tag delivery produces a draft release after its own checks and smoke test; see the repository's Actions and Releases pages for delivery results.

## After the first increment

### Selection, recovery and contact review — 24 November 2026

- [x] Finish provisional ball selection, magnified confirmation and correct-frame forward tracking.
- [x] Keep the original size anchor, tolerate blur, expose the first lost frame and provide a reseed action.
- [x] Preserve earlier observations and reviewed contacts when replacing a forward segment.
- [x] Detect short supported contact transitions across a single missed observation; reject lateral turns and smooth apexes.
- [x] Link image-space and calibrated map contacts to source footage; add explicit contact confirmation.
- [x] Run local synthetic/development-clip checks, regression tests, browser workflows and responsive visual review.
- [ ] Establish a held-out real bounce benchmark with independently visible ground contact.

See `docs/TRACKING-SELECTION-07.md` for behavior, evidence and remaining limitations.

### Review usability and playback — 22 November 2026

- [x] Replace timer-driven JPEG playback with native range-streamed video, preserving exact-frame marking and load-paced codec fallback.
- [x] Reuse bounded decoders and JPEG cache; verify frame identity and local performance.
- [x] Simplify the review layout, improve contrast and mobile layout, and make missing/map contact states actionable.
- [x] Persist ball-colour selection, test red ball versus moving white hat, and prevent old automatic points from becoming retry seeds.
- [x] Rerun synthetic and real development checks, backend/interface/browser tests, and CI.

### Tracking reliability iteration - 19 November 2026

- [x] Establish an offline, reproducible challenge suite with visibility labels and false-positive checks.
- [x] Improve small/white-ball appearance detection and honour the optional image-space tracking boundary throughout the pipeline.
- [x] Improve automatic seed selection and temporal association; handle short occlusions and terminate at camera cuts.
- [x] Report coverage, gaps and failure reasons in the API and review screen; expose heuristic association scores in the API.
- [x] Verify bounce analysis consumes continuous reliable observations and preserves corrections on reanalysis.
- [x] Run local regression/benchmark checks, update documentation, and verify CI.

- [x] Add automatic bounce candidates, contact-image localisation, calibrated line/length, and one-click draft loading with correction preservation.
- [x] Test automatic seed -> bounce -> ground map end to end without manually marking the ball or bounce.
- [ ] Establish reliable automatic ground calibration and broader broadcast coverage; only one of the three supplied intervals currently yields a supported bounce.

- [x] Import the supplied broadcast compilation locally, curate three short intervals, and retain separate manual reference points and automatic results.
- [x] Add seeded colour assistance after observing motion-only centre errors; cover moving-background and occlusion behaviour with regression tests.
- [ ] Validate on held-out fixed-camera net footage. The supplied broadcast replay is a development example, not that benchmark.
- [x] Run exploratory validation on two externally sourced fixed bowler-end match clips (10.77 MB of video). Automatic acquisition failed; seeded tracking drifted on one clip. See `docs/FIXED-CAMERA-VALIDATION.md`.
- [ ] Independently label unobscured ground contact for a real-footage bounce timing benchmark. The two exploratory clips have no confidently scorable contact frame.
- [x] Use those two development clips to improve white-ball acquisition and identity association, rerun unchanged references, and retain missed observations instead of player/bat drift. See `docs/TRACKING-RETEST.md`.

- Collect authorised real net footage; benchmark visible-frame detection, bounce error, unresolved rate, and correction time.
- Select supported camera profiles from measured results.
- Train a detector only if baseline failures justify it; compare on held-out sessions.
- Add automatic delivery segmentation, stronger camera-movement detection, and annotated-video export.
- Add shared access or hosting only if needed by actual users.

## CI/CD scope

GitHub Actions runs lint, type checks, unit/integration tests, browser tests, and production builds. A successful version-tag pipeline creates a portable source-and-built-UI release archive with checksums and a draft release. This is delivery of the local application; no hosted deployment is configured. Check [Actions](https://github.com/ayodhettz/crease-lab/actions) for remote run results.
