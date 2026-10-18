import os
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient
import app.database as database
import app.main as main


def setup_function():
    global _tmp
    _tmp = tempfile.TemporaryDirectory()
    database.DATA_DIR = Path(_tmp.name)
    database.DB_PATH = Path(_tmp.name) / "test.db"
    database.init_db()


def teardown_function():
    _tmp.cleanup()


def test_create_list_update_delete_application():
    with TestClient(main.app) as client:
        payload = {
            "company": "Example Lab",
            "role": "Computer Vision Intern",
            "location": "Paris",
            "work_mode": "Hybrid",
            "status": "Saved",
            "deadline": "2027-01-15",
            "url": "https://example.com/jobs/1",
        }
        response = client.post("/api/applications", json=payload)
        assert response.status_code == 201
        application_id = response.json()["id"]

        listing = client.get("/api/applications?q=Example")
        assert listing.status_code == 200
        assert len(listing.json()["applications"]) == 1

        payload["status"] = "Interview"
        updated = client.put(f"/api/applications/{application_id}", json=payload)
        assert updated.status_code == 200
        assert updated.json()["status"] == "Interview"

        deleted = client.delete(f"/api/applications/{application_id}")
        assert deleted.status_code == 200
        assert client.get(f"/api/applications/{application_id}").status_code == 404


def test_rejects_invalid_status():
    with TestClient(main.app) as client:
        payload = {"company": "Example", "role": "Intern", "status": "Maybe"}
        response = client.post("/api/applications", json=payload)
        assert response.status_code == 422


def test_csv_export():
    with TestClient(main.app) as client:
        response = client.get("/api/export.csv")
        assert response.status_code == 200
        assert "text/csv" in response.headers["content-type"]
        assert "company,role" in response.text
