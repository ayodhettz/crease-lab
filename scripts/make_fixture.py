from pathlib import Path

import cv2
import numpy as np

from backend.demo import create_demo

path = Path(__file__).resolve().parents[1] / "e2e" / "fixtures" / "practice.mp4"
path.parent.mkdir(parents=True, exist_ok=True)
create_demo(path)
print(f"Created synthetic browser test fixture: {path.name}")

# Browser-native fixture. Route it directly in the player test; it is not an MP4 import.
native_path = path.parent / "playback.webm"
native_writer = cv2.VideoWriter(str(native_path), cv2.VideoWriter_fourcc(*"VP80"), 24, (160, 90))
if native_writer.isOpened():
    for f in range(60):
        image = np.full((90, 160, 3), (60, 100, 70), np.uint8)
        cv2.circle(image, (15 + f * 2, 45), 5, (240, 240, 240), -1)
        native_writer.write(image)
    native_writer.release()

bounce_path = path.parent / "bounce.mp4"
writer = cv2.VideoWriter(str(bounce_path), cv2.VideoWriter_fourcc(*"mp4v"), 30, (320, 240))
if not writer.isOpened():
    raise RuntimeError("Cannot create bounce test fixture")
try:
    for t in range(40):
        image = np.full((240, 320, 3), (100, 120, 130), np.uint8)
        for x in range(10, 320, 30):
            for y in range(10, 240, 30):
                cv2.circle(image, (x, y), 1, (65, 80, 90), -1)
        y = 80 + 6 * t if t <= 18 else 188 - 4 * (t - 18)
        cv2.circle(image, (50 + 3 * t, y), 8, (25, 25, 180), -1)
        writer.write(image)
finally:
    writer.release()
