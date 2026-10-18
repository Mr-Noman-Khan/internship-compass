from contextlib import asynccontextmanager
from datetime import date, datetime
from pathlib import Path
import csv
import io
import sqlite3

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, HttpUrl
from typing import Literal

from app.database import connect, init_db

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "static"
STATUSES = {"Saved", "Applied", "Assessment", "Interview", "Offer", "Rejected"}

class ApplicationIn(BaseModel):
    company: str = Field(min_length=1, max_length=120)
    role: str = Field(min_length=1, max_length=160)
    location: str = Field(default="", max_length=120)
    work_mode: Literal["On-site", "Hybrid", "Remote"] = "Hybrid"
    status: Literal["Saved", "Applied", "Assessment", "Interview", "Offer", "Rejected"] = "Saved"
    url: str = Field(default="", max_length=500)
    contact: str = Field(default="", max_length=160)
    deadline: str = Field(default="", max_length=10)
    applied_date: str = Field(default="", max_length=10)
    salary: str = Field(default="", max_length=80)
    notes: str = Field(default="", max_length=4000)

    @staticmethod
    def validate_date(value: str, field: str):
        if value:
            try:
                date.fromisoformat(value)
            except ValueError as exc:
                raise ValueError(f"{field} must use YYYY-MM-DD format") from exc

    def model_post_init(self, __context):
        self.validate_date(self.deadline, "deadline")
        self.validate_date(self.applied_date, "applied_date")
        if self.url and not (self.url.startswith("https://") or self.url.startswith("http://")):
            raise ValueError("URL must start with http:// or https://")

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(title="Internship Compass", version="1.0.0", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=STATIC), name="static")

def row_to_dict(row):
    return dict(row)

def get_application_or_404(conn, application_id: int):
    row = conn.execute("SELECT * FROM applications WHERE id = ?", (application_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Application not found")
    return row_to_dict(row)

@app.get("/")
def home():
    return FileResponse(STATIC / "index.html")

@app.get("/api/health")
def health():
    with connect() as conn:
        count = conn.execute("SELECT COUNT(*) FROM applications").fetchone()[0]
    return {"status": "ok", "applications": count}

@app.get("/api/applications")
def list_applications(q: str = "", status: str = ""):
    if status and status not in STATUSES:
        raise HTTPException(status_code=400, detail="Unknown status")
    sql = "SELECT * FROM applications WHERE 1=1"
    params = []
    if q.strip():
        needle = f"%{q.strip()}%"
        sql += " AND (company LIKE ? OR role LIKE ? OR location LIKE ? OR notes LIKE ?)"
        params.extend([needle, needle, needle, needle])
    if status:
        sql += " AND status = ?"
        params.append(status)
    sql += """ ORDER BY
        CASE WHEN deadline != '' THEN 0 ELSE 1 END,
        CASE WHEN deadline != '' THEN deadline END ASC,
        updated_at DESC"""
    with connect() as conn:
        rows = conn.execute(sql, params).fetchall()
    return {"applications": [row_to_dict(row) for row in rows]}

@app.post("/api/applications", status_code=201)
def create_application(payload: ApplicationIn):
    data = payload.model_dump()
    fields = list(data.keys())
    placeholders = ", ".join(["?"] * len(fields))
    with connect() as conn:
        cursor = conn.execute(
            f"INSERT INTO applications ({', '.join(fields)}) VALUES ({placeholders})",
            [data[field] for field in fields],
        )
        conn.commit()
        return get_application_or_404(conn, cursor.lastrowid)

@app.get("/api/applications/{application_id}")
def get_application(application_id: int):
    with connect() as conn:
        return get_application_or_404(conn, application_id)

@app.put("/api/applications/{application_id}")
def update_application(application_id: int, payload: ApplicationIn):
    data = payload.model_dump()
    data["updated_at"] = datetime.utcnow().isoformat(timespec="seconds")
    assignments = ", ".join(f"{key} = ?" for key in data)
    with connect() as conn:
        get_application_or_404(conn, application_id)
        conn.execute(
            f"UPDATE applications SET {assignments} WHERE id = ?",
            [*data.values(), application_id],
        )
        conn.commit()
        return get_application_or_404(conn, application_id)

@app.delete("/api/applications/{application_id}")
def delete_application(application_id: int):
    with connect() as conn:
        cursor = conn.execute("DELETE FROM applications WHERE id = ?", (application_id,))
        conn.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Application not found")
    return {"deleted": True, "id": application_id}

@app.get("/api/stats")
def stats():
    with connect() as conn:
        total = conn.execute("SELECT COUNT(*) FROM applications").fetchone()[0]
        rows = conn.execute("SELECT status, COUNT(*) AS n FROM applications GROUP BY status").fetchall()
        upcoming = conn.execute("""
            SELECT COUNT(*) FROM applications
            WHERE deadline >= ? AND deadline <= ? AND status NOT IN ('Offer', 'Rejected')
        """, (date.today().isoformat(), date.fromordinal(date.today().toordinal() + 7).isoformat())).fetchone()[0]
        recent = conn.execute("""
            SELECT * FROM applications
            WHERE deadline >= ? AND deadline != '' AND status NOT IN ('Offer', 'Rejected')
            ORDER BY deadline ASC LIMIT 4
        """, (date.today().isoformat(),)).fetchall()
    counts = {status: 0 for status in STATUSES}
    counts.update({row["status"]: row["n"] for row in rows})
    return {
        "total": total,
        "active": sum(counts[s] for s in ("Saved", "Applied", "Assessment", "Interview")),
        "interviews": counts["Interview"],
        "offers": counts["Offer"],
        "upcoming_deadlines": upcoming,
        "by_status": counts,
        "upcoming": [row_to_dict(row) for row in recent],
    }

@app.get("/api/export.csv")
def export_csv():
    fields = ["company", "role", "location", "work_mode", "status", "url", "contact", "deadline", "applied_date", "salary", "notes", "created_at", "updated_at"]
    with connect() as conn:
        rows = conn.execute(f"SELECT {', '.join(fields)} FROM applications ORDER BY updated_at DESC").fetchall()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(fields)
    writer.writerows([[row[field] for field in fields] for row in rows])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=internship-compass.csv"},
    )
