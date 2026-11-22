"""Bounded reusable decoders for exact-frame review and unsupported browser codecs."""

from collections import OrderedDict
from threading import RLock

import cv2


class FrameReader:
    def __init__(self, max_decoders=2, max_bytes=24 * 1024 * 1024):
        self.decoders = OrderedDict()
        self.frames = OrderedDict()
        self.size = 0
        self.max_decoders = max_decoders
        self.max_bytes = max_bytes
        self.lock = RLock()

    def read(self, path, frame):
        path = str(path)
        key = (path, frame)
        with self.lock:
            if key in self.frames:
                self.frames.move_to_end(key)
                return self.frames[key]
            if path not in self.decoders:
                self.decoders[path] = (cv2.VideoCapture(path), 0)
                while len(self.decoders) > self.max_decoders:
                    _, (old, _) = self.decoders.popitem(last=False)
                    old.release()
            cap, next_frame = self.decoders[path]
            self.decoders.move_to_end(path)
            if frame < next_frame or frame - next_frame > 60:
                cap.set(cv2.CAP_PROP_POS_FRAMES, frame)
                next_frame = frame
            while next_frame < frame:
                if not cap.grab():
                    raise ValueError("Could not decode this frame")
                next_frame += 1
            ok, image = cap.read()
            self.decoders[path] = (cap, frame + 1)
            if not ok:
                raise ValueError("Could not decode this frame")
            if image.shape[1] > 1600:
                image = cv2.resize(image, (1600, round(image.shape[0] * 1600 / image.shape[1])))
            ok, data = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 85])
            if not ok:
                raise ValueError("Could not encode this frame")
            data = data.tobytes()
            self.frames[key] = data
            self.size += len(data)
            while self.size > self.max_bytes:
                _, old = self.frames.popitem(last=False)
                self.size -= len(old)
            return data

    def invalidate(self, path):
        path = str(path)
        with self.lock:
            if path in self.decoders:
                self.decoders.pop(path)[0].release()
            for key in list(self.frames):
                if key[0] == path:
                    self.size -= len(self.frames.pop(key))

    def close(self):
        with self.lock:
            for cap, _ in self.decoders.values():
                cap.release()
            self.decoders.clear()
            self.frames.clear()
            self.size = 0
