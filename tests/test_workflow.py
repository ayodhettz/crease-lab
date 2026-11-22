import copy
import csv
import io
import time

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from backend.app import create_app
from backend.geometry import ground_point, transform
from backend.models import Calibration
from backend.store import Store


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path)) as client:
        yield client


@pytest.fixture
def demo(client):
    response = client.post("/api/sessions/demo")
    assert response.status_code == 201, response.text
    return response.json()


def test_ground_mapping_and_degenerate_points():
    calibration = Calibration(
        points=[
            {"x": 0.4, "y": 0.2},
            {"x": 0.6, "y": 0.2},
            {"x": 0.9, "y": 0.9},
            {"x": 0.1, "y": 0.9},
        ],
        width=4,
        length=20,
    )
    assert ground_point(calibration, 0.4, 0.2) == [-2, 0]
    assert ground_point(calibration, 0.9, 0.9) == [2, 20]
    assert ground_point(calibration, 0.5, 0.5)[0] == 0
    bad = calibration.model_copy(update={"points": [calibration.points[0]] * 4})
    with pytest.raises(ValueError):
        transform(bad)


def test_import_rejects_bad_media_and_cleans_up(client):
    response = client.post(
        "/api/sessions/import", files={"file": ("wrong.mp4", b"not a video", "video/mp4")}
    )
    assert response.status_code == 422
    assert list(client.app.state.store.root.joinpath("media").iterdir()) == []
    assert (
        client.post("/api/sessions/import", files={"file": ("clip.exe", b"x")}).status_code == 422
    )


def test_recording_stream_supports_ranges_and_head(client, demo):
    url = f"/api/sessions/{demo['id']}/media"
    source = client.app.state.store.media_path(
        client.app.state.store.get(demo["id"])["video"]["file"]
    ).read_bytes()
    response = client.get(url, headers={"Range": "bytes=0-63"})
    assert response.status_code == 206
    assert response.content == source[:64]
    assert response.headers["content-range"] == f"bytes 0-63/{len(source)}"
    assert client.head(url).headers["content-length"] == str(len(source))
    assert client.get(url, headers={"Range": f"bytes={len(source)}-"}).status_code == 416


def test_ball_colour_is_persisted_and_snapshotted_for_tracking(client, demo):
    state = copy.deepcopy(demo["state"])
    state["ball_colour"] = "red"
    response = client.put(f"/api/sessions/{demo['id']}", json={"revision": 0, "state": state})
    assert response.status_code == 200
    assert response.json()["state"]["ball_colour"] == "red"
    job = client.post(
        f"/api/sessions/{demo['id']}/jobs", json={"delivery_id": state["deliveries"][0]["id"]}
    ).json()
    assert job["input"]["ball_colour"] == "red"


def test_real_import_and_frame_decode(client, demo):
    path = client.app.state.store.media_path(demo["video"]["file"])
    with path.open("rb") as stream:
        response = client.post(
            "/api/sessions/import", files={"file": ("practice.mp4", stream, "video/mp4")}
        )
    imported = response.json()
    assert response.status_code == 201
    assert imported["video"]["hash"] == demo["video"]["hash"]
    frame = client.get(f"/api/sessions/{imported['id']}/frame/20")
    assert frame.status_code == 200
    decoded = cv2.imdecode(np.frombuffer(frame.content, np.uint8), cv2.IMREAD_COLOR)
    assert decoded.shape[:2] == (540, 960)
    assert client.get(f"/api/sessions/{imported['id']}/frame/9999").status_code == 422


def test_revision_conflict_and_history(client, demo):
    sid = demo["id"]
    draft = copy.deepcopy(demo["state"])
    draft["name"] = "Updated practice"
    saved = client.put(f"/api/sessions/{sid}", json={"revision": 0, "state": draft})
    assert saved.status_code == 200
    assert saved.json()["revision"] == 1
    conflict = client.put(f"/api/sessions/{sid}", json={"revision": 0, "state": draft})
    assert conflict.status_code == 409
    assert (
        client.get(f"/api/sessions/{sid}/revisions/0").json()["state"]["name"]
        == demo["state"]["name"]
    )
    assert client.get(f"/api/sessions/{sid}").json()["state"]["name"] == "Updated practice"


def test_invalid_calibration_and_annotations_cannot_be_saved(client, demo):
    draft = copy.deepcopy(demo["state"])
    draft["calibration"]["points"] = [{"x": 0.5, "y": 0.5}] * 4
    assert (
        client.put(f"/api/sessions/{demo['id']}", json={"revision": 0, "state": draft}).status_code
        == 422
    )
    draft = copy.deepcopy(demo["state"])
    draft["deliveries"][0]["end"] = 9999
    assert (
        client.put(f"/api/sessions/{demo['id']}", json={"revision": 0, "state": draft}).status_code
        == 422
    )
    draft = copy.deepcopy(demo["state"])
    draft["deliveries"][0]["status"] = "full_toss"
    assert (
        client.put(f"/api/sessions/{demo['id']}", json={"revision": 0, "state": draft}).status_code
        == 422
    )


def test_statistics_exports_and_csv_formula_safety(client, demo):
    draft = copy.deepcopy(demo["state"])
    draft["deliveries"][0]["status"] = "unreviewed"
    draft["deliveries"][0]["label"] = "=1+1"
    saved = client.put(f"/api/sessions/{demo['id']}", json={"revision": 0, "state": draft}).json()
    assert saved["analysis"]["valid"] == 5
    assert saved["analysis"]["excluded"] == 1
    exported = client.get(f"/api/sessions/{demo['id']}/export.csv")
    rows = list(csv.DictReader(io.StringIO(exported.text)))
    assert rows[0]["label"] == "'=1+1"
    assert rows[0]["revision"] == "1"
    image = client.get(f"/api/sessions/{demo['id']}/export.png")
    assert image.status_code == 200
    assert image.content.startswith(b"\x89PNG")
    draft["deliveries"] = []
    client.put(f"/api/sessions/{demo['id']}", json={"revision": 1, "state": draft})
    assert client.get(f"/api/sessions/{demo['id']}/export.png").status_code == 200


def test_tracking_does_not_overwrite_corrections(client, demo):
    sid = demo["id"]
    response = client.post(f"/api/sessions/{sid}/jobs", json={"delivery_id": "demo-1"})
    assert response.status_code == 202, response.text
    for _ in range(100):
        jobs = client.get(f"/api/sessions/{sid}/jobs").json()
        if jobs[0]["status"] in ("completed", "failed"):
            break
        time.sleep(0.05)
    assert jobs[0]["status"] == "completed", jobs
    if jobs[0]["result"]["bounce"]:
        assert jobs[0]["result"]["bounce"]["provenance"] == "suggested"
    assert len(jobs[0]["result"]["points"]) > 0
    current = client.get(f"/api/sessions/{sid}").json()
    assert current["state"] == demo["state"]
    assert current["revision"] == 0


def test_delete_removes_owned_copy_only(client, demo, tmp_path):
    original = tmp_path / "original.mp4"
    original.write_bytes(b"outside managed media")
    owned = client.app.state.store.media_path(demo["video"]["file"])
    assert client.delete(f"/api/sessions/{demo['id']}").status_code == 204
    assert not owned.exists()
    assert original.exists()
    assert client.get(f"/api/sessions/{demo['id']}").status_code == 404


def test_cross_origin_write_rejected(client):
    assert (
        client.post("/api/sessions/demo", headers={"Origin": "https://example.com"}).status_code
        == 403
    )


def test_interrupted_job_recovery_and_path_confinement(tmp_path):
    store = Store(tmp_path)
    jid, _ = store.create_job("session", "delivery", {"pipeline": "test"})
    store.update_job(jid, "running")
    assert Store(tmp_path).job(jid)["status"] == "failed"
    with pytest.raises(ValueError):
        store.media_path("../original.mp4")
