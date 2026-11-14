from pathlib import Path

from backend.demo import create_demo

path = Path(__file__).resolve().parents[1] / "e2e" / "fixtures" / "practice.mp4"
path.parent.mkdir(parents=True, exist_ok=True)
create_demo(path)
print(f"Created synthetic browser test fixture: {path.name}")
