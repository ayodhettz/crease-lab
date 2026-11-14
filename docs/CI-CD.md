# CI/CD operation

## Continuous integration

`ci.yml` runs on branch pushes, pull requests, manual dispatch, and calls from the release workflow.

- Python matrix: Ubuntu and Windows, Python 3.12, exact requirements, Ruff lint/format, and pytest.
- Web job: Node 24, npm lockfile install, audit at high severity, TypeScript checks, unit tests, production build, and Chromium end-to-end tests.
- Browser failures retain screenshots/traces/report for 7 days. Successful production UI artifacts remain available for 14 days.
- CI has read-only repository permissions and no deployment credentials. Pull requests do not receive a write token from this configuration.

## Continuous delivery

`release.yml` runs when a version tag is pushed. It calls the full CI workflow and requires it to pass before packaging. It verifies `v${package.json.version}` matches the tag, rebuilds the UI, and creates a release ZIP plus checksum. It then creates a draft GitHub release using the workflow's scoped token. Artifacts remain available for 30 days.

Before uploading or creating the draft, the workflow installs the Python dependencies and starts the extracted package in isolation. It checks startup, built assets, a generated demo, frame decoding, and a PNG export. This is delivery of a local application, not cloud deployment. The draft can be reviewed and published in GitHub. No signing certificate or hosted environment is configured.

## Activate on GitHub

Push the project directory as the repository root to the intended GitHub repository. The `.github/` directory must be at that root. Enable Actions if the organisation disables it. The release job requires permission to create draft releases. Optionally protect the default branch by requiring both Python matrix jobs and the web job.

For a new release, update `package.json`, its lockfile, `pyproject.toml`, API version, and release notes consistently, then push a matching version tag after review. Example first version: `v0.1.0`. Do not reuse an existing published tag.

The pipeline uses major-version official GitHub actions; a future hardening step can pin reviewed action SHAs. Dependabot is configured for npm, pip, and GitHub Actions updates. Local `npm audit` is a point-in-time check, not a permanent security guarantee.

## What is and is not verified

Local checks and an extracted-release smoke test are recorded in `VALIDATION.md`. Remote runner results are available at [GitHub Actions](https://github.com/ayodhettz/crease-lab/actions). The Linux matrix job is separate from local Windows validation; its Actions result is the source of truth.

Reference: [GitHub Actions workflow artifacts](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflow-artifacts). The workflow files themselves are the executable source of truth.
