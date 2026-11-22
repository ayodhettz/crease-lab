import cv2

from backend.demo import create_demo
from backend.preview import FrameReader


def test_frame_reader_reuses_decoder_and_preserves_seek_accuracy(tmp_path, monkeypatch):
    path = tmp_path / "demo.mp4"
    create_demo(path)
    original = cv2.VideoCapture
    opened = []

    def capture(source):
        cap = original(source)
        opened.append(cap)
        return cap

    monkeypatch.setattr(cv2, "VideoCapture", capture)
    reader = FrameReader()
    try:
        for frame in [0, 1, 3, 2, 80, 81, 80]:
            actual = reader.read(path, frame)
            reference = original(str(path))
            reference.set(1, frame)
            ok, image = reference.read()
            reference.release()
            assert ok
            _, expected = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 85])
            assert actual == expected.tobytes()
        assert len(opened) == 1
        reader.invalidate(path)
        assert not opened[0].isOpened()
        assert reader.size == 0
    finally:
        reader.close()
