import cv2
import numpy as np

from backend.ball_analysis import bounce_candidate
from backend.tracking import track_video


def test_bounce_discontinuity_but_not_smooth_apex():
    points = [
        {
            "frame": t,
            "x": (50 + 3 * t) / 320,
            "y": (80 + 6 * t if t <= 18 else 188 - 4 * (t - 18)) / 240,
        }
        for t in range(40)
    ]
    assert bounce_candidate(points, 320, 240)["frame"] == 18
    smooth = [
        {"frame": t, "x": (50 + 3 * t) / 320, "y": (150 - 0.15 * (t - 18) ** 2) / 240}
        for t in range(40)
    ]
    assert bounce_candidate(smooth, 320, 240) is None
    assert bounce_candidate(points[:10], 320, 240) is None


def test_automatic_seed_contact_and_calibrated_pitch_mapping(tmp_path):
    path = tmp_path / "bounce.mp4"
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), 30, (320, 240))
    assert writer.isOpened()
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
    calibration = {
        "points": [
            {"x": 0.1, "y": 0.1},
            {"x": 0.9, "y": 0.1},
            {"x": 0.9, "y": 0.9},
            {"x": 0.1, "y": 0.9},
        ],
        "width": 4,
        "length": 20,
    }
    result = track_video(path, 0, 39, calibration=calibration)
    assert result["automatic_seed"] is True
    assert result["bounce"]["frame"] == 18
    assert result["bounce"]["provenance"] == "suggested"
    assert result["contact_analysis"]["ground"]["units"] == "m"
    assert result["contact_analysis"]["ground"]["status"] == "estimated"
    assert all(p["provenance"] != "manual" for p in result["points"])
