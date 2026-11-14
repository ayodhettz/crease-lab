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

- Collect authorised real net footage; benchmark visible-frame detection, bounce error, unresolved rate, and correction time.
- Select supported camera profiles from measured results.
- Train a detector only if baseline failures justify it; compare on held-out sessions.
- Add automatic delivery segmentation, stronger camera-movement detection, and annotated-video export.
- Add shared access or hosting only if needed by actual users.

## CI/CD scope

GitHub Actions runs lint, type checks, unit/integration tests, browser tests, and production builds. A successful version-tag pipeline creates a portable source-and-built-UI release archive with checksums and a draft release. This is delivery of the local application; no hosted deployment is configured. Check [Actions](https://github.com/ayodhettz/crease-lab/actions) for remote run results.
