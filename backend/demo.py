"""A synthetic, labelled demonstration. Not a real-footage accuracy benchmark."""

import cv2
import numpy as np


def create_demo(path):
    fps, width, height, count = 24, 960, 540, 216
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height))
    if not writer.isOpened():
        raise ValueError("Synthetic demo encoder is unavailable")
    corners = [[0.43, 0.32], [0.57, 0.32], [0.83, 0.96], [0.17, 0.96]]
    deliveries = []
    for number in range(6):
        start = number * 36
        bounce_frame = start + 20
        ground = np.array(
            [[-1.525, 0], [1.525, 0], [1.525, 20.12], [-1.525, 20.12]], dtype=np.float32
        )
        inverse = cv2.getPerspectiveTransform(ground, np.array(corners, dtype=np.float32))
        sample = [[-0.2, 4.8], [0.1, 5.3], [0.5, 6.6], [-0.3, 4.4], [0.7, 8.2], [0.1, 5.8]][number]
        bounce = cv2.perspectiveTransform(np.array([[sample]], dtype=np.float32), inverse)[
            0, 0
        ].tolist()
        track = []
        for frame in range(start, start + 32):
            u = (frame - start) / 20
            if u <= 1:
                x = 0.55 + (bounce[0] - 0.55) * u
                y = 0.89 + (bounce[1] - 0.89) * u - 0.13 * np.sin(np.pi * u)
            else:
                x = bounce[0] + 0.018 * (u - 1)
                y = bounce[1] - 0.28 * (u - 1)
            track.append(
                {
                    "frame": frame,
                    "x": float(x),
                    "y": float(y),
                    "provenance": "manual",
                    "score": None,
                }
            )
        deliveries.append(
            {
                "id": f"demo-{number + 1}",
                "label": f"Delivery {number + 1:02}",
                "bowler": "Demo bowler",
                "tag": "Synthetic",
                "start": start,
                "end": start + 31,
                "status": "reviewed",
                "track": track,
                "bounce": {
                    "frame": bounce_frame,
                    "x": bounce[0],
                    "y": bounce[1],
                    "provenance": "manual",
                },
            }
        )
    try:
        for frame in range(count):
            image = np.full((height, width, 3), (47, 65, 54), dtype=np.uint8)
            # Net mesh and a perspective practice strip.
            for x in range(0, width, 55):
                cv2.line(image, (x, 0), (x, height), (69, 88, 76), 1)
            for y in range(0, height, 45):
                cv2.line(image, (0, y), (width, y), (69, 88, 76), 1)
            polygon = np.array([[int(x * width), int(y * height)] for x, y in corners])
            cv2.fillConvexPoly(image, polygon, (119, 139, 143))
            cv2.polylines(image, [polygon], True, (185, 203, 198), 2)
            for dx in [-7, 0, 7]:
                cv2.line(image, (480 + dx, 173), (480 + dx, 138), (218, 225, 213), 3)
            cv2.line(image, (435, 189), (525, 189), (231, 232, 217), 2)
            delivery = deliveries[min(frame // 36, 5)]
            point = next((p for p in delivery["track"] if p["frame"] == frame), None)
            if point:
                radius = max(3, int(7 - (frame % 36) * 0.1))
                cv2.circle(
                    image,
                    (int(point["x"] * width), int(point["y"] * height)),
                    radius,
                    (72, 82, 235),
                    -1,
                    cv2.LINE_AA,
                )
            cv2.putText(
                image,
                "SYNTHETIC NET / DEMO FOOTAGE",
                (28, 40),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.65,
                (218, 228, 222),
                1,
                cv2.LINE_AA,
            )
            writer.write(image)
    finally:
        writer.release()
    return {
        "name": "Evening nets / demo",
        "notes": "Synthetic footage with pre-marked points. "
        "Use this to explore the interface; it does not validate real-world tracking.",
        "calibration": {
            "points": [{"x": x, "y": y} for x, y in corners],
            "width": 3.05,
            "length": 20.12,
        },
        "target": {"x_min": -0.6, "x_max": 0.6, "y_min": 3, "y_max": 7},
        "deliveries": deliveries,
    }
