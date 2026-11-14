import cv2
import numpy as np

from backend.tracking import track_video


def make_moving_scene(path, hidden=()):
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), 30, (320, 240))
    assert writer.isOpened()
    try:
        for f in range(20):
            image = np.full((240, 320, 3), (100, 120, 130), np.uint8)
            # Simulated camera/background motion and a closer dark distractor.
            for x in range(-40, 350, 35):
                cv2.line(image, (x + f * 2, 0), (x + f * 2, 240), (80, 100, 110), 2)
            cv2.circle(image, (75 + f * 4, 110), 9, (25, 25, 25), -1)
            if f not in hidden:
                cv2.circle(image, (55 + f * 5, 80 + f), 8, (35, 35, 185), -1)
            writer.write(image)
    finally:
        writer.release()


def test_seeded_colour_tracks_centre_despite_camera_motion(tmp_path):
    path = tmp_path / "moving.mp4"
    make_moving_scene(path)
    result = track_video(path, 0, 19, {"frame": 0, "x": 55 / 320, "y": 80 / 240})
    assert result["method"] == "seeded-appearance"
    assert len(result["points"]) == 20
    for p in result["points"]:
        assert np.hypot(p["x"] * 320 - (55 + p["frame"] * 5), p["y"] * 240 - (80 + p["frame"])) < 4


def test_appearance_stays_missing_instead_of_following_distractor(tmp_path):
    path = tmp_path / "occluded.mp4"
    make_moving_scene(path, hidden=range(5, 15))
    result = track_video(path, 0, 19, {"frame": 0, "x": 55 / 320, "y": 80 / 240})
    assert [p["frame"] for p in result["points"]] == list(range(5))
    assert result["bounce"] is None
