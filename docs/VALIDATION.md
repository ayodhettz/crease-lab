# Validation record

Date: 14 November 2026. Platform: Windows, Python 3.12.14, Node.js 24.22.0.

## Passed locally

- 11 Python tests: perspective mapping, invalid calibration/annotation rejection, invalid-upload cleanup, actual MP4 import and frame decode, revision conflict/history, reviewed-only statistics, CSV formula protection, PNG generation including empty sessions, asynchronous tracking isolation, deletion confinement, cross-origin writes, interrupted-job recovery, and release allowlisting.
- 4 TypeScript unit tests: perspective mapping, underdetermined geometry, statistics denominators, and disconnected track gaps.
- 3 Chromium end-to-end tests: demo/correction/save/reload/exports/tracking; MP4 upload/calibration/delivery creation/bounce marking/filtering; mobile viewport fit.
- TypeScript strict compilation including unused declarations/parameters; Vite production build.
- Ruff lint and formatting; Prettier formatting of frontend and workflow files.
- npm audit reported zero advisories after dependencies were installed and the initially flagged test runner was replaced with a patched release. This is a point-in-time result.
- The packaged ZIP was extracted outside the source tree and started using its own files and isolated storage on port 8011. Health, built JavaScript, synthetic demo creation, frame decoding, and PNG export passed.
- Desktop and mobile renderings inspected. The local app is launched separately on port 8000 with a synthetic demonstration session.

## Observations

The Python test suite reports a Starlette deprecation warning about the existing `httpx` TestClient integration. All tests pass; this warning concerns a future test dependency migration, not production playback or processing.

The first sandboxed API test attempt could not initialise its local socket pair; rerunning with local-network access resolved it. No application workaround was added for this environment restriction.

## Not yet verified

- Real-world ball tracking, bounce-position error, supported capture profiles, model generalisation, or pilot correction-time targets. The demo and test fixture are synthetic.
- Linux execution is not part of this local Windows record. Check the remote Linux matrix job in [GitHub Actions](https://github.com/ayodhettz/crease-lab/actions) for its result.
- A public release. The repository is private and the pipeline creates a draft only after checks and an extracted-package smoke test pass. Remote results are recorded in GitHub, separately from this local report.
- Installation on a clean computer without the development environment. The archive requires Python dependencies; it is not a standalone executable.

## Next validation task

Collect 50-100 authorised net deliveries across at least two sessions. Retain measured ground check points and a small high-quality reference subset. Record visible-frame track quality, line/length error, unresolved rate, false associations, processing time, and manual correction time. Split future model training/evaluation by session rather than adjacent frames.
