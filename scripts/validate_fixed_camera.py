"""Offline exploratory evaluation of externally sourced, manually spot-checked footage.

No automatic downloads. Keep original source files outside the repository.
"""

import argparse
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np

from backend.tracking import PIPELINE_VERSION, track_video


def validate(media, output):
    manifest = json.loads(
        (Path(__file__).resolve().parents[1] / "docs/fixed-camera-references.json").read_text()
    )
    output.mkdir(parents=True, exist_ok=True)
    report = {
        "pipeline": PIPELINE_VERSION,
        "kind": "exploratory real-footage spot checks, not a blinded benchmark",
        "downloaded_video_bytes": 0,
        "source_video_bytes": 0,
        "clips": [],
    }
    for clip in manifest["clips"]:
        source = media / clip["file"]
        if not source.is_file():
            raise FileNotFoundError(
                f"Missing local source: {source}; this script never downloads footage"
            )
        report["source_video_bytes"] += source.stat().st_size
        cap = cv2.VideoCapture(str(source))
        width, height = int(cap.get(3)), int(cap.get(4))
        entry = {
            "id": clip["id"],
            "source": clip["source"],
            "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            "width": width,
            "height": height,
            "fps": cap.get(5),
            "frames": int(cap.get(7)),
            "bounce_reference": clip["bounce_reference"],
            "bounce_reference_reason": clip["bounce_reference_reason"],
            "modes": {},
        }
        seed = {**clip["seed"], "x": clip["seed"]["x"] / width, "y": clip["seed"]["y"] / height}
        for mode, mark in [("automatic", None), ("seeded", seed)]:
            result = track_video(source, clip["start"], clip["end"], seed=mark)
            (output / f"{clip['id']}-{mode}-result.json").write_text(json.dumps(result, indent=2))
            by_frame = {p["frame"]: p for p in result["points"]}
            checks = []
            for frame, x, y in clip["references"]:
                if mode == "seeded" and frame == seed["frame"]:
                    continue
                p = by_frame.get(frame)
                error = float(np.hypot(p["x"] * width - x, p["y"] * height - y)) if p else None
                checks.append(
                    {
                        "frame": frame,
                        "error_px": round(error, 2) if error is not None else None,
                        "within_tolerance": error is not None and error <= clip["tolerance_px"],
                    }
                )
            errors = [c["error_px"] for c in checks if c["error_px"] is not None]
            entry["modes"][mode] = {
                "labelled_checks": len(checks),
                "correct_checks": sum(c["within_tolerance"] for c in checks),
                "missing_checks": sum(c["error_px"] is None for c in checks),
                "wrong_location_checks": sum(
                    c["error_px"] is not None and not c["within_tolerance"] for c in checks
                ),
                "median_error_px_on_returned_checks": round(float(np.median(errors)), 2)
                if errors
                else None,
                "tolerance_px": clip["tolerance_px"],
                "returned_points": len(result["points"]),
                "bounce": result["bounce"],
                "bounce_frame_error": None,
                "diagnostics": result["diagnostics"],
                "checks": checks,
            }
        # Source-based evidence with references and both outputs; no synthetic paths.
        sheet = np.full((3 * 244, 4 * 360, 3), 240, np.uint8)
        refs = clip["references"][:12]
        for index, (frame, x, y) in enumerate(refs):
            cap.set(1, frame)
            ok, image = cap.read()
            if not ok:
                continue
            cx, cy = max(0, min(width - 320, x - 160)), max(0, min(height - 200, y - 100))
            tile = image[cy : cy + 200, cx : cx + 320].copy()
            cv2.circle(tile, (x - cx, y - cy), 15, (40, 210, 40), 2)
            for mode, colour in [("automatic", (20, 80, 230)), ("seeded", (240, 100, 20))]:
                r = json.loads((output / f"{clip['id']}-{mode}-result.json").read_text())
                p = next((p for p in r["points"] if p["frame"] == frame), None)
                if p:
                    cv2.drawMarker(
                        tile,
                        (round(p["x"] * width - cx), round(p["y"] * height - cy)),
                        colour,
                        cv2.MARKER_CROSS,
                        18,
                        2,
                    )
            sx, sy = index % 4 * 360, index // 4 * 244
            sheet[sy : sy + 200, sx : sx + 320] = tile
            cv2.putText(
                sheet,
                f"frame {frame}: green reference",
                (sx + 5, sy + 220),
                0,
                0.43,
                (25, 25, 25),
                1,
            )
        cv2.imwrite(str(output / f"{clip['id']}-spot-checks.jpg"), sheet)
        cap.release()
        report["clips"].append(entry)
    (output / "report.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--media", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    validate(args.media, args.output)
