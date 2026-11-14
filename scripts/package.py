"""Create a reproducible-structure portable release. Never includes user recordings."""

import hashlib
import json
import zipfile
from pathlib import Path


def package(root: Path):
    version = json.loads((root / "package.json").read_text())["version"]
    if not (root / "frontend/dist/index.html").exists():
        raise SystemExit("Production UI missing; run npm run build before packaging")
    out = root / "release"
    out.mkdir(exist_ok=True)
    archive = out / f"crease-lab-{version}.zip"
    files = []
    for directory in (
        "backend",
        "frontend/dist",
        "frontend/src",
        "docs",
        "tests",
        "scripts",
        ".github",
    ):
        files.extend(
            p
            for p in (root / directory).rglob("*")
            if p.is_file() and "__pycache__" not in p.parts and p.suffix != ".pyc"
        )
    files.extend(
        root / filename
        for filename in (
            "README.md",
            "TASKS.md",
            "requirements.txt",
            "run.py",
            "start.ps1",
            "pyproject.toml",
            "requirements.in",
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
        )
    )
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as target:
        for file in sorted(files):
            target.write(file, f"crease-lab/{file.relative_to(root).as_posix()}")
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    (out / "SHA256SUMS.txt").write_text(f"{digest}  {archive.name}\n", encoding="utf-8")
    print(archive)
    return archive


if __name__ == "__main__":
    package(Path(__file__).resolve().parents[1])
