import hashlib
import zipfile
from pathlib import Path

from scripts.package import package


def test_release_allowlist_excludes_recordings_and_caches(tmp_path):
    root = Path(__file__).resolve().parents[1]
    # Supply a minimal source layout to verify archive policy without a UI build.
    for filename in (
        "README.md",
        "TASKS.md",
        "requirements.txt",
        "requirements.in",
        "run.py",
        "start.ps1",
        "pyproject.toml",
        "package.json",
        "package-lock.json",
        "tsconfig.json",
        "vite.config.ts",
        "playwright.config.ts",
        "frontend/index.html",
        "e2e/workflow.spec.ts",
        ".gitignore",
        ".prettierrc.json",
        ".prettierignore",
    ):
        target = tmp_path / filename
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes((root / filename).read_bytes())
    for filename in (
        "frontend/dist/index.html",
        "backend/app.py",
        ".github/workflows/ci.yml",
        "data/media/private.mp4",
        "backend/__pycache__/app.pyc",
        "node_modules/private.txt",
    ):
        target = tmp_path / filename
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("fixture")
    archive = package(tmp_path)
    with zipfile.ZipFile(archive) as zipped:
        names = zipped.namelist()
    assert "crease-lab/backend/app.py" in names
    assert "crease-lab/.github/workflows/ci.yml" in names
    assert not any("private" in name or "__pycache__" in name for name in names)
    assert (
        hashlib.sha256(archive.read_bytes()).hexdigest()
        in (archive.parent / "SHA256SUMS.txt").read_text()
    )
