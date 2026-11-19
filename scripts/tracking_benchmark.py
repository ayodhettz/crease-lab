"""Offline challenge clips with known visibility and image-space ball centres.

Generated scenes exercise failure modes; they are not real-net validation data.
"""

import argparse
import json
import time
from pathlib import Path

import cv2
import numpy as np

from backend.tracking import PIPELINE_VERSION, track_video


def scenarios():
    return [
        {"name": "red_seeded", "seeded": True},
        {"name": "white_seeded", "colour": "white", "seeded": True},
        {"name": "red_auto"},
        {"name": "white_auto", "colour": "white"},
        {
            "name": "small_fast_blurred",
            "seeded": True,
            "radius": 3,
            "speed": 12,
            "count": 30,
            "blur": True,
        },
        {"name": "short_occlusion", "seeded": True, "hidden": [14, 15]},
        {"name": "long_occlusion", "seeded": True, "hidden": list(range(8, 22))},
        {"name": "crossing_distractor", "seeded": True, "distractor": True},
        {"name": "empty_moving_players", "empty": True},
        {"name": "outside_region", "outside": True},
        {"name": "camera_cut", "seeded": True, "cut": 18},
        {"name": "late_entry", "entry": 95, "count": 130},
        {"name": "shrinking_ball", "seeded": True, "shrink": True},
        {"name": "camera_pan", "seeded": True, "pan": 2},
        {"name": "white_with_pads", "colour": "white", "pads": True},
        {"name": "panning_empty_scene", "empty": True, "pan": 2},
    ]


def generate(path, case):
    width, height, fps = 640, 360, 30
    count = case.get("count", 48)
    rng = np.random.default_rng(917)
    background = np.full((height, width, 3), (67, 92, 77), np.uint8)
    background += rng.integers(0, 12, background.shape, dtype=np.uint8)
    cv2.fillConvexPoly(
        background, np.array([[240, 30], [400, 30], [580, 350], [60, 350]]), (112, 132, 144)
    )
    for x in range(15, width, 37):
        for y in range(12, height, 29):
            cv2.circle(background, (x, y), 1, (58, 73, 66), -1)
    cv2.circle(background, (380, 75), 9, (30, 30, 190), -1)  # stationary sponsor/marker
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height))
    if not writer.isOpened():
        raise RuntimeError("Cannot generate benchmark clip")
    truth = []
    try:
        for f in range(count):
            pan = case.get("pan", 0) * f
            image = cv2.warpAffine(
                background,
                np.float32([[1, 0, pan], [0, 1, 0]]),
                (width, height),
                borderMode=cv2.BORDER_REFLECT,
            )
            entry = case.get("entry", 0)
            t = max(0, f - entry)
            x, y = 90 + case.get("speed", 6) * t + pan, 95 + 2 * t
            radius = (
                max(3, round(9 - 6 * f / (count - 1)))
                if case.get("shrink")
                else case.get("radius", 6)
            )
            if case.get("outside"):
                x, y = 145 + 3 * t, 100 + t
            cut = case.get("cut")
            if cut is not None and f >= cut:
                image[:] = (130, 65, 35)
            # Moving player-like objects are deliberately present without a ball too.
            cv2.ellipse(image, (500 - f, 245), (15, 43), 0, 0, 360, (207, 211, 210), -1)
            if case.get("pads"):
                cv2.circle(image, (480 - f, 185), 12, (235, 237, 237), -1)
            if case.get("distractor"):
                cv2.circle(image, (230 - 3 * f, 95 + 2 * f), radius, (28, 28, 185), -1)
            present = not case.get("empty") and f >= entry and f not in case.get("hidden", [])
            if present:
                colour = (233, 238, 239) if case.get("colour") == "white" else (28, 28, 185)
                if case.get("blur") and f:
                    cv2.ellipse(image, (x, y), (8, radius), 0, 0, 360, colour, -1)
                else:
                    cv2.circle(image, (x, y), radius, colour, -1)
            truth.append(
                {
                    "frame": f,
                    "x": x / width,
                    "y": y / height,
                    "radius": radius,
                    "visible": bool(
                        present and not case.get("outside") and (cut is None or f < cut)
                    ),
                }
            )
            writer.write(image)
    finally:
        writer.release()
    seed = {"frame": 0, "x": truth[0]["x"], "y": truth[0]["y"]} if case.get("seeded") else None
    roi = (
        [
            {"x": 0.6, "y": 0.05},
            {"x": 0.95, "y": 0.05},
            {"x": 0.95, "y": 0.95},
            {"x": 0.6, "y": 0.95},
        ]
        if case.get("outside")
        else None
    )
    return truth, seed, roi


def evaluate(truth, points, seed=None):
    expected = {p["frame"]: p for p in truth if seed is None or p["frame"] != seed["frame"]}
    observed = {p["frame"]: p for p in points if p["frame"] in expected}
    errors, hits, false = [], 0, 0
    visible = sum(p["visible"] for p in expected.values())
    for f, p in observed.items():
        reference = expected[f]
        if not reference["visible"]:
            false += 1
            continue
        error = float(np.hypot((p["x"] - reference["x"]) * 640, (p["y"] - reference["y"]) * 360))
        errors.append(error)
        if error <= max(4, reference["radius"] * 1.5):
            hits += 1
        else:
            false += 1
    return {
        "visible_frames": visible,
        "correct_frames": hits,
        "recall": round(hits / visible, 4) if visible else None,
        "false_observations": false,
        "median_error_px": round(float(np.median(errors)), 2) if errors else None,
        "p90_error_px": round(float(np.percentile(errors, 90)), 2) if errors else None,
    }


def benchmark(output):
    output.mkdir(parents=True, exist_ok=True)
    results = []
    for case in scenarios():
        path = output / (case["name"] + ".mp4")
        truth, seed, roi = generate(path, case)
        started = time.perf_counter()
        result = track_video(path, 0, len(truth) - 1, seed=seed, roi=roi)
        metrics = evaluate(truth, result["points"], seed)
        results.append(
            {
                "case": case["name"],
                **metrics,
                "seconds": round(time.perf_counter() - started, 3),
                "method": result["method"],
                "diagnostics": result.get("diagnostics"),
            }
        )
    report = {
        "pipeline": PIPELINE_VERSION,
        "kind": "synthetic challenge suite, not real-net accuracy",
        "cases": results,
        "totals": {
            "visible_frames": sum(r["visible_frames"] for r in results),
            "correct_frames": sum(r["correct_frames"] for r in results),
            "false_observations": sum(r["false_observations"] for r in results),
        },
    }
    (output / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("work/tracking-benchmark"))
    benchmark(parser.parse_args().output)
