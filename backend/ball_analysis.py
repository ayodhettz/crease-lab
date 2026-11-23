"""Automatic contact-event candidates with explicit geometry and evidence boundaries."""

import cv2
import numpy as np


def find_coloured_seed(path, start, end, roi=None, ball_colour="auto"):
    """Acquire compact red/white objects with sustained motion relative to background.

    Scan the whole delivery interval, keeping at most sixteen observations per candidate.
    Ambiguous acquisitions remain unresolved rather than following arbitrary motion.
    """
    cap = cv2.VideoCapture(str(path))
    from .tracking import BallAppearance, white_ball_mask

    cap.set(cv2.CAP_PROP_POS_FRAMES, start)
    fps = cap.get(cv2.CAP_PROP_FPS)
    previous, old_grey = [], None
    ranked_seeds = {}
    seed_colours = {}
    try:
        for frame in range(start, end + 1):
            ok, image = cap.read()
            if not ok:
                break
            height, width = image.shape[:2]
            grey = cv2.resize(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY), (width // 2, height // 2))
            shift = np.zeros(2)
            if old_grey is not None:
                features = cv2.goodFeaturesToTrack(old_grey, 100, 0.02, 8)
                if features is not None and len(features) >= 12:
                    moved, valid, _ = cv2.calcOpticalFlowPyrLK(old_grey, grey, features, None)
                    if moved is not None:
                        good = valid.reshape(-1) == 1
                        flow = (moved - features).reshape(-1, 2)[good] * 2
                        if len(flow) >= 12:
                            shift = np.median(flow, axis=0)
            old_grey = grey
            hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
            red = (
                ((hsv[:, :, 0] <= 10) | (hsv[:, :, 0] >= 160))
                & (hsv[:, :, 1] >= 55)
                & (hsv[:, :, 2] >= 25)
            )
            dim_white = white_ball_mask(hsv, minimum_value=180) > 0
            white = dim_white & (hsv[:, :, 2] >= 210)
            region = np.full((height, width), 255, np.uint8)
            if roi:
                region[:] = 0
                cv2.fillConvexPoly(
                    region,
                    np.array([[p["x"] * width, p["y"] * height] for p in roi], np.int32),
                    255,
                )
            current = []
            for colour, raw in [("red", red), ("white", white), ("dim-white", dim_white)]:
                if (ball_colour == "red" and colour != "red") or (
                    ball_colour == "white" and colour == "red"
                ):
                    continue
                mask = raw.astype(np.uint8) * 255 & region
                contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                for contour in contours:
                    area = cv2.contourArea(contour)
                    x, y, w, h = cv2.boundingRect(contour)
                    limit = 0.008 if colour == "red" else 0.003
                    perimeter = cv2.arcLength(contour, True)
                    minimum_area = max(6, width * height * 0.00002)
                    if (
                        not minimum_area <= area <= width * height * limit
                        or max(w, h) / max(1, min(w, h)) > 5
                    ):
                        continue
                    if not perimeter or 4 * np.pi * area / perimeter**2 < (
                        0.2 if colour != "red" else 0.5
                    ):
                        continue
                    padding = max(4, round(max(w, h) * 0.5))
                    ring = hsv[
                        max(0, y - padding) : min(height, y + h + padding),
                        max(0, x - padding) : min(width, x + w + padding),
                    ]
                    if (
                        colour == "red"
                        and ((ring[:, :, 1] < 45) & (ring[:, :, 2] > 160)).mean() > 0.22
                    ):
                        continue
                    moments = cv2.moments(contour)
                    centre = np.array(
                        [moments["m10"] / moments["m00"], moments["m01"] / moments["m00"]]
                    )
                    if not roi and not (
                        0.06 * width < centre[0] < 0.94 * width
                        and 0.04 * height < centre[1] < 0.85 * height
                    ):
                        continue
                    matches = [
                        p
                        for p in previous
                        if p["colour"] == colour
                        and 0.45 * p["area"] <= area <= 2.2 * p["area"]
                        and np.linalg.norm(centre - p["centre"] - shift) < min(width, height) * 0.08
                    ]

                    def association_error(p):
                        history = p["history"]
                        velocity = (
                            history[-1][1] - history[-2][1] if len(history) >= 2 else np.zeros(2)
                        )
                        return np.linalg.norm(centre - p["centre"] - velocity - shift)

                    old = min(matches, key=association_error) if matches else None
                    if (
                        old
                        and len(old["history"]) >= 2
                        and association_error(old) > max(8, np.sqrt(area / np.pi) * 1.5)
                    ):
                        old = None
                    history = (old["history"] if old else []) + [(frame, centre)]
                    speeds = (old["speeds"] if old else []) + [
                        float(np.linalg.norm(centre - old["centre"] - shift)) if old else 0
                    ]
                    current.append(
                        dict(
                            colour=colour,
                            area=area,
                            centre=centre,
                            history=history[-16:],
                            speeds=speeds[-15:],
                            origin=old["origin"] if old else (frame, centre),
                        )
                    )
            candidates = [
                p
                for p in current
                if len(p["history"]) >= 5
                and np.mean(p["speeds"]) > 1.5
                and np.linalg.norm(p["history"][-1][1] - p["history"][0][1]) > 6
            ]
            for p in candidates:
                positions = np.array([point for _, point in p["history"]])
                times = np.arange(len(positions))
                fit = np.column_stack([np.ones(len(times)), times, times**2])
                residual = float(
                    np.sqrt(
                        np.mean(
                            (positions - fit @ np.linalg.lstsq(fit, positions, rcond=None)[0]) ** 2
                        )
                    )
                )
                radius = max(2, np.sqrt(p["area"] / np.pi))
                if np.linalg.norm(np.ptp(positions, axis=0)) < radius * 3:
                    p["rank"] = 0
                    continue
                coefficients = np.linalg.lstsq(fit, positions, rcond=None)[0]
                acceleration = coefficients[2] * 2
                # Prefer sustained flight curvature over moving hands or footwear.
                flight = (
                    max(0, float(acceleration[1] - abs(acceleration[0]))) if len(times) >= 8 else 0
                )
                p["rank"] = (
                    float(np.mean(p["speeds"]))
                    / (1 + residual)
                    / np.sqrt(radius)
                    * (1 + min(15, flight * 20))
                    * min(len(times) / 8, 2)
                    if residual <= max(1.5, radius * 0.3)
                    else 0
                )
            candidates = [p for p in candidates if p["rank"] > 0]
            candidates.sort(key=lambda p: p["rank"], reverse=True)
            unique = []
            for candidate in candidates:
                if any(
                    candidate["colour"] != "red"
                    and other["colour"] != "red"
                    and np.linalg.norm(candidate["centre"] - other["centre"])
                    < max(6, np.sqrt(candidate["area"] / np.pi))
                    for other in unique
                ):
                    continue
                unique.append(candidate)
            for candidates in (
                [p for p in unique if p["colour"] == "red"],
                [p for p in unique if p["colour"] != "red"],
            ):
                if candidates and (
                    len(candidates) == 1 or candidates[0]["rank"] > 1.4 * candidates[1]["rank"]
                ):
                    f, p = candidates[0]["origin"]
                    key = (f, round(float(p[0]), 2), round(float(p[1]), 2))
                    rank = candidates[0]["rank"] / (1 + (f - start) / max(8, fps * 0.3))
                    ranked_seeds[key] = max(ranked_seeds.get(key, 0), rank)
                    seed_colours[key] = candidates[0]["colour"]
            ranked_seeds = dict(
                sorted(
                    ranked_seeds.items(),
                    key=lambda item: (seed_colours[item[0]] == "red", item[1]),
                    reverse=True,
                )[:16]
            )
            seed_colours = {key: seed_colours[key] for key in ranked_seeds}
            previous = current
    finally:
        cap.release()
    # Check initialization on the original frame; no frame cache grows with clip length.
    cap = cv2.VideoCapture(str(path))
    try:
        candidates = sorted(
            ranked_seeds.items(),
            key=lambda item: (
                ball_colour == "auto" and seed_colours.get(item[0]) == "red",
                item[1],
            ),
            reverse=True,
        )
        for (f, x, y), _ in candidates:
            cap.set(cv2.CAP_PROP_POS_FRAMES, f)
            ok, image = cap.read()
            if ok and BallAppearance(image, np.array([x, y])).active:
                return dict(frame=f, x=x / width, y=y / height, provenance="observed", score=None)
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
    max_drift = 0.0
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
                                    centre = np.array([width / 2, height / 2, 1])
                                    max_drift = max(
                                        max_drift,
                                        float(np.linalg.norm((cumulative @ centre - centre)[:2])),
                                    )
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
        "max_drift_px": round(max_drift, 2),
    }


def bounce_candidate(points, width, height):
    """Find a velocity discontinuity, while rejecting smooth trajectory apexes."""
    ordered = sorted(points, key=lambda p: p["frame"])
    if len(ordered) < 7:
        return None
    frames = np.array([p["frame"] for p in ordered])
    coords = np.array([[p["x"] * width, p["y"] * height] for p in ordered])
    candidates = []
    for index in range(3, len(ordered) - 3):
        lo, hi = max(0, index - 6), min(len(ordered), index + 7)
        # Fit actual frame times across a single missed detection, without
        # inventing a contact at an unobserved frame or spanning long occlusions.
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
            and split[3, 1] < -max(1.5, abs(split[3, 0]) * 0.5)
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
                        "support_before": index - lo,
                        "support_after": hi - index - 1,
                        "missing_frames": int(frames[hi - 1] - frames[lo] + 1 - (hi - lo)),
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
    moving = (
        camera.get("status") != "compensated"
        or camera.get("mean_shift_px", 0) > 1
        or camera.get("max_drift_px", 0) > 4
    )
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
                "Camera movement or insufficient background evidence prevents reliable fixed-ground mapping."
                if moving and calibration
                else "This camera view has no ground calibration. Contact is located on the source pitch image; metre-based line and length are unavailable."
            ),
        },
    }
