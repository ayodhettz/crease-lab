import cv2
import numpy as np

from .models import Calibration, SessionState


def transform(calibration: Calibration):
    """Map normalized ground-contact pixels to metres, never airborne tracks."""
    src = np.array([[p.x, p.y] for p in calibration.points], dtype=np.float32)
    # Require a convex ordered quadrilateral, not just four distinct points.
    if not cv2.isContourConvex(src.reshape(-1, 1, 2)) or abs(cv2.contourArea(src)) < 0.005:
        raise ValueError("Mark four well-spaced corners in the requested order")
    half = calibration.width / 2
    dst = np.array(
        [[-half, 0], [half, 0], [half, calibration.length], [-half, calibration.length]],
        dtype=np.float32,
    )
    matrix = cv2.getPerspectiveTransform(src, dst)
    if not np.isfinite(matrix).all() or np.linalg.cond(matrix) > 1e8:
        raise ValueError("Calibration is unstable; use better-spaced reference points")
    return matrix


def ground_point(calibration: Calibration, x: float, y: float):
    projected = cv2.perspectiveTransform(
        np.array([[[x, y]]], dtype=np.float32), transform(calibration)
    )[0, 0]
    if not np.isfinite(projected).all():
        raise ValueError("Ground point cannot be mapped with this calibration")
    return [round(float(projected[0]), 4), round(float(projected[1]), 4)]


def analyse(state: SessionState):
    mapped = []
    for d in state.deliveries:
        if state.calibration and d.bounce:
            x, y = ground_point(state.calibration, d.bounce.x, d.bounce.y)
            t = state.target
            mapped.append(
                {
                    "id": d.id,
                    "x": x,
                    "y": y,
                    "status": d.status,
                    "in_target": t.x_min <= x <= t.x_max and t.y_min <= y <= t.y_max,
                }
            )
    valid = [p for p in mapped if p["status"] == "reviewed"]
    coords = np.array([[p["x"], p["y"]] for p in valid], dtype=float)
    return {
        "points": mapped,
        "total": len(state.deliveries),
        "valid": len(valid),
        "excluded": len(state.deliveries) - len(valid),
        "hit_rate": sum(p["in_target"] for p in valid) / len(valid) if valid else None,
        "mean": coords.mean(axis=0).tolist() if len(valid) else None,
        "spread": coords.std(axis=0).tolist() if len(valid) else None,
    }
