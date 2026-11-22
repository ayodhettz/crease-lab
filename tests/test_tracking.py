import cv2
import numpy as np
import pytest

from backend.tracking import track_video
from scripts.tracking_benchmark import evaluate, generate, scenarios


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


@pytest.mark.parametrize(
    "name",
    [
        "white_auto",
        "small_fast_blurred",
        "short_occlusion",
        "shrinking_ball",
        "late_entry",
        "empty_moving_players",
        "outside_region",
        "camera_cut",
        "panning_empty_scene",
    ],
)
def test_tracking_challenges(tmp_path, name):
    case = next(c for c in scenarios() if c["name"] == name)
    path = tmp_path / "challenge.mp4"
    truth, seed, roi = generate(path, case)
    result = track_video(path, 0, len(truth) - 1, seed=seed, roi=roi)
    metrics = evaluate(truth, result["points"], seed)
    assert metrics["false_observations"] == 0
    if metrics["visible_frames"]:
        assert metrics["recall"] >= 0.95
    if name == "camera_cut":
        assert result["diagnostics"]["stop_reason"] == "camera-cut"
    if name == "short_occlusion":
        assert not {14, 15} & {p["frame"] for p in result["points"]}


@pytest.mark.parametrize("automatic", [False, True])
def test_tinted_ball_crossing_bright_player_with_repeated_frames(tmp_path, automatic):
    path = tmp_path / "tinted.mp4"
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), 60, (320, 240))
    assert writer.isOpened()
    truth = []
    try:
        for frame in range(72):
            step = frame // 2
            x, y = 60 + 5 * step, round(55 + 0.12 * (step - 10) ** 2)
            image = np.full((240, 320, 3), (70, 100, 75), np.uint8)
            cv2.ellipse(image, (145, 75), (18, 25), 0, 0, 360, (160, 180, 210), -1)
            cv2.rectangle(image, (125, 100), (167, 180), (210, 95, 40), -1)
            # White at release, increasingly blue under the simulated lighting.
            colour = (248, round(238 - step * 1.1), round(235 - step * 2))
            cv2.circle(image, (x, y), 6, colour, -1)
            writer.write(image)
            truth.append((x, y))
    finally:
        writer.release()
    seed = None if automatic else dict(frame=0, x=truth[0][0] / 320, y=truth[0][1] / 240)
    result = track_video(path, 0, 71, seed=seed)
    assert len(result["points"]) >= 65
    assert all(
        np.linalg.norm(np.array([p["x"] * 320, p["y"] * 240]) - truth[p["frame"]]) < 8
        for p in result["points"]
    )
