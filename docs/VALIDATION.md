# Validation record

Date: 14 November 2026. Platform: Windows, Python 3.12.14, Node.js 24.22.0.

## Passed locally

- 15 Python tests: geometry, media/persistence/export regression cases, seeded appearance/occlusion handling, bounce-discontinuity versus smooth-apex discrimination, and automatic seed/contact/ground mapping.
- 6 TypeScript unit tests: geometry, statistics denominators, disconnected gaps, automatic estimate application, manual correction preservation, and camera-ineligible ground exclusion.
- 4 Chromium end-to-end tests: the original review/import/mobile workflows plus automatic seed -> bounce -> calibrated map without any manual ball or bounce marks.
- TypeScript strict compilation including unused declarations/parameters; Vite production build.
- Ruff lint and formatting; Prettier formatting of frontend and workflow files.
- npm audit reported zero advisories after dependencies were installed and the initially flagged test runner was replaced with a patched release. This is a point-in-time result.
- The packaged ZIP was extracted outside the source tree and started using its own files and isolated storage on port 8011. Health, built JavaScript, synthetic demo creation, frame decoding, and PNG export passed.
- Desktop and mobile renderings inspected. The local app is launched separately on port 8000 with a synthetic demonstration session.

## Observations

A user-supplied broadcast compilation has now been imported and reviewed locally. Three short intervals and a sparse image-space reference were prepared. This prompted an optional seeded appearance tracker; its development spot-check is described in [FOOTAGE-TRIAL.md](FOOTAGE-TRIAL.md). Broadcast camera changes prevent treating this as the planned fixed-camera net benchmark.

A second session, **Automatic bounce / uploaded replay**, was created with empty tracks and no contact marks. Its Replay A run used `seed: null`, selected its own coloured-ball seed, and returned frame 761 as a bounce candidate. The saved result has zero manual points. The other two intervals remain unresolved. The contact image is available, while metric mapping is ineligible for that moving camera view.

The first remote [Checks and build run](https://github.com/ayodhettz/crease-lab/actions/runs/43574888901) passed on Windows and Linux, including the frontend/browser job. The initial action versions emitted a runner deprecation warning; subsequent workflow configuration pins verified current official release commits. Check the latest Actions run for the pinned configuration and versioned delivery results.

The Python test suite reports a Starlette deprecation warning about the existing `httpx` TestClient integration. All tests pass; this warning concerns a future test dependency migration, not production playback or processing.

The first sandboxed API test attempt could not initialise its local socket pair; rerunning with local-network access resolved it. No application workaround was added for this environment restriction.

## Not yet verified

- Real-world ball tracking, bounce-position error, supported capture profiles, model generalisation, or pilot correction-time targets. The demo and test fixture are synthetic.
- Linux execution is not part of this local Windows record. Check the remote Linux matrix job in [GitHub Actions](https://github.com/ayodhettz/crease-lab/actions) for its result.
- A public release. The repository is private and the pipeline creates a draft only after checks and an extracted-package smoke test pass. Remote results are recorded in GitHub, separately from this local report.
- Installation on a clean computer without the development environment. The archive requires Python dependencies; it is not a standalone executable.

## Next validation task

Collect 50-100 authorised net deliveries across at least two sessions. Retain measured ground check points and a small high-quality reference subset. Record visible-frame track quality, line/length error, unresolved rate, false associations, processing time, and manual correction time. Split future model training/evaluation by session rather than adjacent frames.
