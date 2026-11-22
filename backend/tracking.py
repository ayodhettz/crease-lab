"""Appearance and temporal association tracker. Produces suggestions, never approvals."""

import cv2
import numpy as np

PIPELINE_VERSION = "contact-analysis-0.6.0"


def white_ball_mask(hsv, minimum_value=180, radius=None):
    """Isolate locally bright compact objects, including blue-tinted white balls.

    Absolute white thresholds merge balls with faces and reject coloured lighting.
    Local luminance contrast separates small highlights from broad player regions.
    """
    value = hsv[:, :, 2]
    sigma = max(4, min(24, (radius or min(value.shape) * 0.01) * 1.4))
    scale = min(1.0, 480 / min(value.shape))
    small = cv2.resize(value, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    background = cv2.resize(
        cv2.GaussianBlur(small, (0, 0), sigma * scale), (value.shape[1], value.shape[0])
    )
    contrast = value.astype(np.int16) - background.astype(np.int16)
    return ((hsv[:, :, 1] < 125) & (value >= minimum_value) & (contrast >= 9)).astype(
        np.uint8
    ) * 255


class BallAppearance:
    """Compact colour or white-ball appearance learned from a visible seed."""

    def __init__(self, image, centre):
        x, y = np.round(centre).astype(int)
        height, width = image.shape[:2]
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        patch = hsv[max(0, y - 1) : min(height, y + 2), max(0, x - 1) : min(width, x + 2)]
        pixels = patch.reshape(-1, 3)
        saturated = pixels[pixels[:, 1] >= 70]
        self.white = bool(np.median(pixels[:, 1]) < 65 and np.median(pixels[:, 2]) > 165)
        self.active = self.white or len(saturated) >= max(3, len(pixels) // 2)
        self.area = None
        self.minimum_value = max(185, min(230, float(np.median(pixels[:, 2])) - 5))
        self.brightness = float(np.median(pixels[:, 2]))
        if not self.active:
            return
        angles = (pixels if self.white else saturated)[:, 0].astype(float) / 180 * 2 * np.pi
        self.hue = float(
            np.arctan2(np.sin(angles).mean(), np.cos(angles).mean())
            % (2 * np.pi)
            * 180
            / (2 * np.pi)
        )
        self.min_saturation = max(55, float(np.median(pixels[:, 1])) * 0.55)
        matches = self.candidates(image)
        if matches:
            chosen = min(matches, key=lambda c: np.linalg.norm(c[0] - centre))
            if np.linalg.norm(chosen[0] - centre) <= 20:
                self.area = chosen[1]
            else:
                self.active = False
        else:
            self.active = False

    def candidates(self, image):
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        hue_distance = np.abs(hsv[:, :, 0].astype(float) - self.hue)
        hue_distance = np.minimum(hue_distance, 180 - hue_distance)
        mask = (
            (hue_distance <= 14) & (hsv[:, :, 1] >= self.min_saturation) & (hsv[:, :, 2] >= 20)
        ).astype(np.uint8) * 255
        if self.white:
            mask = white_ball_mask(
                hsv, self.minimum_value, np.sqrt(self.area / np.pi) if self.area else None
            )
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        candidates = []
        for contour in contours:
            area = cv2.contourArea(contour)
            x, y, w, h = cv2.boundingRect(contour)
            if area < 2 or area > image.shape[0] * image.shape[1] * 0.015:
                continue
            if max(w, h) / max(1, min(w, h)) > 5:
                continue
            if self.area and not self.area * 0.2 <= area <= self.area * 4:
                continue
            moments = cv2.moments(contour)
            if moments["m00"]:
                centre = np.array(
                    [moments["m10"] / moments["m00"], moments["m01"] / moments["m00"]]
                )
                if self.white:
                    component = np.zeros((h, w), np.uint8)
                    cv2.drawContours(component, [contour - np.array([[[x, y]]])], -1, 255, -1)
                    values = hsv[y : y + h, x : x + w, 2].astype(float)
                    peak_floor = max(
                        self.minimum_value, float(np.percentile(values[component > 0], 90)) - 15
                    )
                    weights = np.maximum(0, values - peak_floor) ** 2 * (component > 0)
                    if weights.sum() > 0:
                        yy, xx = np.indices(weights.shape)
                        centre = np.array(
                            [
                                x + (xx * weights).sum() / weights.sum(),
                                y + (yy * weights).sum() / weights.sum(),
                            ]
                        )
                candidates.append(
                    (
                        centre,
                        area,
                    )
                )
        return candidates


def track_video(path, start, end, seed=None, roi=None, calibration=None, ball_colour="auto"):
    from .ball_analysis import analyse_contact, find_coloured_seed

    automatic_seed = seed is None
    if seed is None:
        seed = find_coloured_seed(path, start, end, roi=roi, ball_colour=ball_colour)
    cap = cv2.VideoCapture(str(path))
    points = []
    stopped_reason = "end-of-interval"
    longest_gap = 0
    previous = None
    last = None
    velocity = np.zeros(2)
    appearance = None
    gap = 0
    width, height = int(cap.get(3)), int(cap.get(4))
    fps = cap.get(cv2.CAP_PROP_FPS)
    if not cap.isOpened() or width <= 0 or height <= 0:
        cap.release()
        raise ValueError("Cannot decode recording")
    mask = np.ones((height, width), dtype=np.uint8) * 255
    if roi:
        mask[:] = 0
        poly = np.array([[int(p["x"] * width), int(p["y"] * height)] for p in roi])
        # Optional image-space search boundary; independent of ground calibration.
        cv2.fillConvexPoly(mask, poly.astype(np.int32), 255)

    cap.set(cv2.CAP_PROP_POS_FRAMES, max(0, start - 1))
    try:
        for frame in range(max(0, start - 1), end + 1):
            ok, image = cap.read()
            if not ok:
                break
            grey = cv2.GaussianBlur(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY), (5, 5), 0)
            if seed and frame == seed["frame"]:
                last = np.array([seed["x"] * width, seed["y"] * height])
                if not mask[
                    min(height - 1, max(0, round(last[1]))), min(width - 1, max(0, round(last[0])))
                ]:
                    stopped_reason = "seed-outside-region"
                    break
                appearance = BallAppearance(image, last)
                if (ball_colour == "red" and appearance.white) or (
                    ball_colour == "white" and not appearance.white
                ):
                    stopped_reason = "seed-colour-mismatch"
                    appearance.active = False
                    break
                if not appearance.active:
                    stopped_reason = "unsupported-seed-appearance"
                    break
                points.append(
                    {
                        "frame": frame,
                        "x": seed["x"],
                        "y": seed["y"],
                        "provenance": "observed" if automatic_seed else "manual",
                        "score": None,
                    }
                )
                previous, gap = grey, 0
                continue
            if previous is None or frame < start or (seed and frame < seed["frame"]):
                previous = grey
                continue
            if previous is not None and float(np.mean(cv2.absdiff(previous, grey))) > 45:
                stopped_reason = "camera-cut"
                break
            if appearance and appearance.active:
                # Do not switch to unrelated motion when the seeded appearance is hidden.
                # A short occlusion can recover locally; a long gap ends this seeded track.
                if last is None:
                    previous = grey
                    continue
                expected = last + velocity * (gap + 1)
                radius = min(min(width, height) * 0.2, max(35, np.sqrt(appearance.area or 25) * 4))
                choices = []
                hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
                for p, area in appearance.candidates(image):
                    px, py = round(p[0]), round(p[1])
                    if not mask[min(height - 1, py), min(width - 1, px)]:
                        continue
                    distance = float(np.linalg.norm(p - expected))
                    light = float(
                        np.median(hsv[max(0, py - 1) : py + 2, max(0, px - 1) : px + 2, 2])
                    )
                    penalty = max(0, appearance.brightness - light) * 0.8 if appearance.white else 0
                    cost = distance + penalty
                    # Once motion is established, a weak white-blob match is a gap,
                    # not permission to switch identity onto the bat or a player.
                    gate = radius * 0.6 if appearance.white and len(points) >= 4 else radius
                    strong_motion = appearance.white and distance <= max(
                        5, np.sqrt(area / np.pi) * 0.6
                    )
                    if cost <= gate or strong_motion:
                        choices.append((cost, p, area, light))
                choices.sort(key=lambda c: c[0])
                if choices and (len(choices) == 1 or choices[1][0] - choices[0][0] >= 3):
                    position = choices[0][1]
                    velocity = 0.5 * velocity + 0.5 * (position - last) / (gap + 1)
                    appearance.area = 0.7 * (appearance.area or choices[0][2]) + 0.3 * choices[0][2]
                    appearance.brightness = 0.5 * appearance.brightness + 0.5 * choices[0][3]
                    last = position
                    points.append(
                        {
                            "frame": frame,
                            "x": float(last[0] / width),
                            "y": float(last[1] / height),
                            "provenance": "observed",
                            "score": float(max(0.1, 1 - choices[0][0] / radius)),
                        }
                    )
                    gap = 0
                else:
                    gap += 1
                    longest_gap = max(longest_gap, gap)
                    if gap > max(2, round(fps * 0.15)):
                        stopped_reason = "lost-ball"
                        break
                previous = grey
                continue
            stopped_reason = "no-supported-ball"
            break
    finally:
        cap.release()
    contact = (
        analyse_contact(path, points, width, height, calibration)
        if appearance and appearance.active
        else {
            "bounce": None,
            "contact_analysis": {
                "status": "unresolved",
                "ground": None,
                "reason": "No supported ball appearance was acquired. Use a shorter clear delivery interval or mark a visible ball and analyse again.",
            },
        }
    )
    return {
        "diagnostics": {
            "observed_frames": sum(p["provenance"] == "observed" for p in points),
            "coverage": len(points) / max(1, end - start + 1),
            "longest_gap": longest_gap,
            "stop_reason": stopped_reason,
            "ball_colour": "white"
            if appearance and appearance.white
            else "colour"
            if appearance
            else None,
            "score_meaning": "association quality, not calibrated probability",
            "requested_ball_colour": ball_colour,
        },
        "pipeline": PIPELINE_VERSION,
        "points": points,
        **contact,
        "automatic_seed": automatic_seed and seed is not None,
        "method": "seeded-appearance" if appearance and appearance.active else "unresolved",
        "message": (
            "Experimental appearance-assisted candidates. "
            if appearance and appearance.active
            else "No supported ball track. "
        )
        + ("Bounce candidate detected. " if contact["bounce"] else "Bounce unresolved. ")
        + "Automatic estimates remain separate from reviewed measurements.",
    }
