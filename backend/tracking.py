"""Experimental static-camera motion baseline. Produces suggestions, never approvals."""

import cv2
import numpy as np

PIPELINE_VERSION = "motion-baseline-0.1.0"


def track_video(path, start, end, seed=None, roi=None):
    cap = cv2.VideoCapture(str(path))
    points = []
    previous = None
    last = None
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
                points.append(
                    {
                        "frame": frame,
                        "x": seed["x"],
                        "y": seed["y"],
                        "provenance": "manual",
                        "score": None,
                    }
                )
                previous, gap = grey, 0
                continue
            if previous is None or frame < start or (seed and frame < seed["frame"]):
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
    return {
        "pipeline": PIPELINE_VERSION,
        "points": points,
        "bounce": None,
        "message": "Experimental motion candidates. Inspect the trail and mark ground contact manually. "
        "No automatic bounce or 3D accuracy is claimed.",
    }
