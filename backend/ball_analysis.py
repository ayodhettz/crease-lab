"""Automatic contact-event candidates with explicit geometry and evidence boundaries."""

import cv2
import numpy as np


def find_coloured_seed(path, start, end):
    """Look for an isolated moving red ball over three frames; reject white-shirt logos."""
    cap = cv2.VideoCapture(str(path))
    cap.set(cv2.CAP_PROP_POS_FRAMES, start)
    previous = []
    try:
        for frame in range(start, min(end + 1, start + 80)):
            ok, image = cap.read()
            if not ok:
                break
            hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
            mask = (
                ((hsv[:, :, 0] <= 10) | (hsv[:, :, 0] >= 160))
                & (hsv[:, :, 1] >= 55)
                & (hsv[:, :, 2] >= 25)
            ).astype(np.uint8) * 255
            mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            height, width = image.shape[:2]
            current = []
            for contour in contours:
                area = cv2.contourArea(contour)
                perimeter = cv2.arcLength(contour, True)
                if not 8 <= area <= width * height * 0.008 or not perimeter:
                    continue
                if 4 * np.pi * area / (perimeter * perimeter) < 0.5:
                    continue
                x, y, w, h = cv2.boundingRect(contour)
                centre = np.array([x + w / 2, y + h / 2])
                if (
                    max(w, h) / max(1, min(w, h)) > 2
                    or not 0.12 * width < centre[0] < 0.9 * width
                    or not 0.13 * height < centre[1] < 0.92 * height
                ):
                    continue
                padding = max(4, round(max(w, h) * 0.5))
                ring = hsv[
                    max(0, y - padding) : min(height, y + h + padding),
                    max(0, x - padding) : min(width, x + w + padding),
                ]
                if ((ring[:, :, 1] < 45) & (ring[:, :, 2] > 160)).mean() > 0.22:
                    continue
                chain = []
                for old in previous:
                    distance = np.linalg.norm(centre - old["centre"])
                    if (
                        0.3 * old["area"] <= area <= 3 * old["area"]
                        and distance <= min(width, height) * 0.12
                    ):
                        chain = max(chain, old["chain"] + [old["centre"]], key=len)
                current.append({"centre": centre, "area": area, "chain": chain})
            candidates = [
                p
                for p in current
                if len(p["chain"]) >= 2 and np.linalg.norm(p["centre"] - p["chain"][0]) >= 4
            ]
            candidates.sort(key=lambda c: c["area"], reverse=True)
            if candidates and (
                len(candidates) == 1 or candidates[0]["area"] > 3 * candidates[1]["area"]
            ):
                p = candidates[0]["centre"]
                return {
                    "frame": frame,
                    "x": float(p[0] / width),
                    "y": float(p[1] / height),
                    "provenance": "observed",
                    "score": None,
                }
            previous = current
    finally:
        cap.release()
    return None


def compensate_camera(path, points, width, height):
    """Estimate frame-to-frame ground/background similarity motion, excluding overlays."""
    if len(points) < 12:
        return points, {"status": "insufficient-track", "frames": 0}
    by_frame = {p["frame"]: p for p in points}
    cap = cv2.VideoCapture(str(path))
    start, end = min(by_frame), max(by_frame)
    cap.set(cv2.CAP_PROP_POS_FRAMES, start)
    cumulative = np.eye(3)
    previous = None
    stable = []
    fits = 0
    movements = []
    try:
        for f in range(start, end + 1):
            ok, image = cap.read()
            if not ok:
                break
            # Work at half resolution; flow estimates are transformed back to source pixels.
            grey = cv2.cvtColor(cv2.resize(image, (width // 2, height // 2)), cv2.COLOR_BGR2GRAY)
            if previous is not None:
                mask = np.full(previous.shape, 255, np.uint8)
                mask[: round(height * 0.09), : round(width * 0.16)] = 0
                mask[round(height * 0.43) :, :] = 0
                p = by_frame.get(f - 1)
                if p:
                    cv2.circle(
                        mask, (round(p["x"] * width / 2), round(p["y"] * height / 2)), 35, 0, -1
                    )
                features = cv2.goodFeaturesToTrack(
                    previous, maxCorners=220, qualityLevel=0.02, minDistance=7, mask=mask
                )
                if features is not None and len(features) >= 12:
                    next_points, status, _ = cv2.calcOpticalFlowPyrLK(
                        previous, grey, features, None
                    )
                    if next_points is not None:
                        valid = status.reshape(-1) == 1
                        before = features.reshape(-1, 2)[valid] * 2
                        after = next_points.reshape(-1, 2)[valid] * 2
                        if len(before) >= 12:
                            affine, inliers = cv2.estimateAffinePartial2D(
                                before, after, method=cv2.RANSAC, ransacReprojThreshold=3
                            )
                            if affine is not None and inliers.mean() > 0.55:
                                scale = np.linalg.norm(affine[0, :2])
                                shift = np.linalg.norm(affine[:, 2])
                                if 0.92 < scale < 1.08 and shift < 100:
                                    step = np.vstack([affine, [0, 0, 1]])
                                    cumulative = step @ cumulative
                                    fits += 1
                                    movements.append(float(shift))
            p = by_frame.get(f)
            if p:
                stable_pixel = np.linalg.inv(cumulative) @ np.array(
                    [p["x"] * width, p["y"] * height, 1]
                )
                stable.append(
                    {**p, "x": float(stable_pixel[0] / width), "y": float(stable_pixel[1] / height)}
                )
            previous = grey
    finally:
        cap.release()
    total = end - start
    reliable = total > 0 and fits / total >= 0.8
    return (stable if reliable else points), {
        "status": "compensated" if reliable else "insufficient-background-features",
        "frames": fits,
        "total": total,
        "mean_shift_px": round(float(np.mean(movements)), 2) if movements else 0,
    }


def bounce_candidate(points, width, height):
    """Find a velocity discontinuity, while rejecting smooth trajectory apexes."""
    ordered = sorted(points, key=lambda p: p["frame"])
    if len(ordered) < 13:
        return None
    frames = np.array([p["frame"] for p in ordered])
    coords = np.array([[p["x"] * width, p["y"] * height] for p in ordered])
    candidates = []
    for index in range(6, len(ordered) - 6):
        lo, hi = index - 6, index + 7
        if np.max(np.diff(frames[lo:hi])) > 2:
            continue
        t = frames[lo:hi] - frames[index]
        values = coords[lo:hi]
        smooth = np.column_stack([np.ones(len(t)), t, t * t])
        kink = np.column_stack([smooth, np.maximum(t, 0)])
        normal = np.linalg.lstsq(smooth, values, rcond=None)[0]
        split = np.linalg.lstsq(kink, values, rcond=None)[0]
        base_error = float(np.sum((smooth @ normal - values) ** 2))
        residual = float(np.sum((kink @ split - values) ** 2))
        gain = 1 - residual / max(base_error, 1)
        before, after = split[1], split[1] + split[3]
        cosine = np.dot(before, after) / max(np.linalg.norm(before) * np.linalg.norm(after), 1e-6)
        angle = float(np.degrees(np.arccos(np.clip(cosine, -1, 1))))
        jump = float(np.linalg.norm(split[3]))
        if (
            gain > 0.65
            and angle > 30
            and jump > 2
            and np.sqrt(residual / len(t)) < max(8, height * 0.02)
        ):
            candidates.append(
                (
                    gain * jump,
                    ordered[index],
                    {
                        "fit_gain": round(gain, 3),
                        "turn_degrees": round(angle, 1),
                        "velocity_change_px_per_frame": round(jump, 2),
                    },
                )
            )
    if not candidates:
        return None
    candidates.sort(key=lambda c: c[0], reverse=True)
    _, point, evidence = candidates[0]
    return {"frame": point["frame"], "evidence": evidence}


def analyse_contact(path, points, width, height, calibration=None):
    stable, camera = compensate_camera(path, points, width, height)
    event = bounce_candidate(stable, width, height)
    if not event:
        return {
            "bounce": None,
            "contact_analysis": {
                "status": "unresolved",
                "reason": "No sufficiently supported bounce transition in this interval.",
                "camera": camera,
                "ground": None,
            },
        }
    source = next(p for p in points if p["frame"] == event["frame"])
    # Locate the bottom of the colour component, an approximate ground-contact pixel.
    cap = cv2.VideoCapture(str(path))
    cap.set(cv2.CAP_PROP_POS_FRAMES, event["frame"])
    ok, image = cap.read()
    cap.release()
    radius = 0.0
    if ok:
        from .tracking import BallAppearance

        model = BallAppearance(image, np.array([source["x"] * width, source["y"] * height]))
        if model.active and model.area:
            radius = float(np.sqrt(model.area / np.pi))
    contact = {
        "frame": event["frame"],
        "x": source["x"],
        "y": min(1, source["y"] + radius / height),
        "provenance": "suggested",
    }
    ground = None
    moving = camera.get("mean_shift_px", 0) > 1
    contact["ground_eligible"] = not moving
    if calibration and not moving:
        from .geometry import ground_point
        from .models import Calibration

        x, y = ground_point(Calibration.model_validate(calibration), contact["x"], contact["y"])
        ground = {
            "x": x,
            "y": y,
            "units": "m",
            "status": "estimated",
            "line": "left of centre" if x < -0.15 else "right of centre" if x > 0.15 else "central",
            "length": "yorker"
            if y < 2
            else "full"
            if y < 4
            else "good length"
            if y < 7
            else "short",
        }
    return {
        "bounce": contact,
        "contact_analysis": {
            "status": "candidate",
            "reason": "Automatic motion-change estimate; review the contact frame.",
            "camera": camera,
            "evidence": event["evidence"],
            "ground": ground,
            "radius_px": round(radius, 1),
            "ground_reason": None
            if ground
            else (
                "Camera movement invalidates the fixed ground calibration for this interval."
                if moving and calibration
                else "This camera view has no ground calibration. Contact is located on the source pitch image; metre-based line and length are unavailable."
            ),
        },
    }
