"""Experimental static-camera motion baseline. Produces suggestions, never approvals."""

import cv2
import numpy as np

PIPELINE_VERSION = "contact-analysis-0.3.0"


class BallAppearance:
    """Small saturated-colour model learned from a user seed, not a global red-ball rule."""

    def __init__(self, image, centre):
        x, y = np.round(centre).astype(int)
        height, width = image.shape[:2]
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        patch = hsv[max(0, y - 4) : min(height, y + 5), max(0, x - 4) : min(width, x + 5)]
        pixels = patch.reshape(-1, 3)
        saturated = pixels[pixels[:, 1] >= 70]
        self.active = len(saturated) >= max(6, len(pixels) // 2)
        self.area = None
        if not self.active:
            return
        angles = saturated[:, 0].astype(float) / 180 * 2 * np.pi
        self.hue = float(
            np.arctan2(np.sin(angles).mean(), np.cos(angles).mean())
            % (2 * np.pi)
            * 180
            / (2 * np.pi)
        )
        self.min_saturation = max(55, float(np.median(saturated[:, 1])) * 0.55)
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
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        candidates = []
        for contour in contours:
            area = cv2.contourArea(contour)
            _, _, w, h = cv2.boundingRect(contour)
            if area < 6 or area > image.shape[0] * image.shape[1] * 0.015:
                continue
            if max(w, h) / max(1, min(w, h)) > 2.5:
                continue
            if self.area and not self.area * 0.2 <= area <= self.area * 4:
                continue
            moments = cv2.moments(contour)
            if moments["m00"]:
                candidates.append(
                    (
                        np.array(
                            [moments["m10"] / moments["m00"], moments["m01"] / moments["m00"]]
                        ),
                        area,
                    )
                )
        return candidates


def track_video(path, start, end, seed=None, roi=None, calibration=None):
    from .ball_analysis import analyse_contact, find_coloured_seed

    automatic_seed = seed is None
    if seed is None:
        seed = find_coloured_seed(path, start, end)
    cap = cv2.VideoCapture(str(path))
    points = []
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
        # Include a little flight space around the ground polygon.
        cv2.fillConvexPoly(mask, poly.astype(np.int32), 255)
        mask = cv2.dilate(mask, np.ones((41, 41), np.uint8))
    cap.set(cv2.CAP_PROP_POS_FRAMES, max(0, start - 1))
    try:
        for frame in range(max(0, start - 1), end + 1):
            ok, image = cap.read()
            if not ok:
                break
            grey = cv2.GaussianBlur(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY), (5, 5), 0)
            if seed and frame == seed["frame"]:
                last = np.array([seed["x"] * width, seed["y"] * height])
                appearance = BallAppearance(image, last)
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
            if appearance and appearance.active:
                # Do not switch to unrelated motion when the seeded appearance is hidden.
                # A short occlusion can recover locally; a long gap ends this seeded track.
                if last is None:
                    previous = grey
                    continue
                expected = last + velocity * (gap + 1)
                radius = min(min(width, height) * 0.2, max(35, np.sqrt(appearance.area or 25) * 4))
                choices = [
                    (float(np.linalg.norm(p - expected)), p)
                    for p, _ in appearance.candidates(image)
                    if np.linalg.norm(p - expected) <= radius
                ]
                choices.sort(key=lambda c: c[0])
                if choices and (len(choices) == 1 or choices[1][0] - choices[0][0] >= 3):
                    position = choices[0][1]
                    velocity = 0.5 * velocity + 0.5 * (position - last) / (gap + 1)
                    last = position
                    points.append(
                        {
                            "frame": frame,
                            "x": float(last[0] / width),
                            "y": float(last[1] / height),
                            "provenance": "observed",
                            "score": 0.55,
                        }
                    )
                    gap = 0
                else:
                    gap += 1
                    if gap > max(2, round(fps * 0.15)):
                        last = None
                previous = grey
                continue
            delta = cv2.absdiff(previous, grey)
            _, motion = cv2.threshold(delta, 22, 255, cv2.THRESH_BINARY)
            motion = cv2.bitwise_and(motion, mask)
            # Select ball-like moving components. This deliberately conservative
            # baseline is vulnerable to hands, net movement, and blur.
            contours, _ = cv2.findContours(motion, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            candidates = []
            for contour in contours:
                area = cv2.contourArea(contour)
                x, y, w, h = cv2.boundingRect(contour)
                if not 4 <= area <= width * height * 0.0015 or max(w, h) / max(1, min(w, h)) > 4:
                    continue
                centre = np.array([x + w / 2, y + h / 2])
                distance = float(np.linalg.norm(centre - last)) if last is not None else 0
                if last is not None and distance > min(width, height) * 0.2:
                    continue
                candidates.append((distance if last is not None else -area, centre))
            if candidates:
                candidates.sort(key=lambda c: c[0])
                # Ambiguous candidates should not create an invented observation.
                if (
                    len(candidates) > 1
                    and last is not None
                    and abs(candidates[1][0] - candidates[0][0]) < 3
                ):
                    gap += 1
                else:
                    last = candidates[0][1]
                    points.append(
                        {
                            "frame": frame,
                            "x": float(last[0] / width),
                            "y": float(last[1] / height),
                            "provenance": "observed",
                            "score": 0.35,
                        }
                    )
                    gap = 0
            else:
                gap += 1
            if gap > max(2, round(fps * 0.15)):
                last = None
            previous = grey
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
                "reason": "The motion-only track is not sufficient to locate a bounce. Mark a visible ball and analyse again.",
            },
        }
    )
    return {
        "pipeline": PIPELINE_VERSION,
        "points": points,
        **contact,
        "automatic_seed": automatic_seed and seed is not None,
        "method": "seeded-appearance" if appearance and appearance.active else "motion",
        "message": (
            "Experimental appearance-assisted candidates. "
            if appearance and appearance.active
            else "Experimental motion candidates. "
        )
        + ("Bounce candidate detected. " if contact["bounce"] else "Bounce unresolved. ")
        + "Automatic estimates remain separate from reviewed measurements.",
    }
