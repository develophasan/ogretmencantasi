"""
Backend tests for Attendance / Yoklama feature (iteration 2).
Covers:
  - POST /api/attendance  (upsert + enum validation + teacher ownership filter + idempotency)
  - GET  /api/attendance?date=
  - GET  /api/attendance/range?start=&end=
  - GET  /api/attendance/student/{id}
  - GET  /api/dashboard -> attendance_today
  - Auth enforcement (401) + _id leak prevention
"""
import os
import uuid
import pytest
import requests
from datetime import datetime, timezone

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://class-manager-183.preview.emergentagent.com').rstrip('/')


# ---------- fixtures: students for teacher A and one for teacher B ----------

@pytest.fixture(scope="module")
def students_a(client_a):
    ids = []
    for name in ["TEST_Att1", "TEST_Att2", "TEST_Att3"]:
        r = client_a.post(f"{BASE_URL}/api/students", json={
            "first_name": name, "last_name": "Öğrenci",
            "birth_date": "2020-03-10", "gender": "Kız",
        })
        assert r.status_code == 200, r.text
        ids.append(r.json()["id"])
    yield ids


@pytest.fixture(scope="module")
def student_b(client_b):
    r = client_b.post(f"{BASE_URL}/api/students", json={
        "first_name": "TEST_BAtt", "last_name": "X",
        "birth_date": "2020-01-01", "gender": "Erkek",
    })
    assert r.status_code == 200
    return r.json()["id"]


# ============================================================
# Attendance POST / GET by date
# ============================================================

class TestAttendancePostGet:
    def test_post_attendance_upsert(self, client_a, students_a):
        date = "2026-01-10"
        payload = {
            "date": date,
            "entries": [
                {"student_id": students_a[0], "status": "Geldi",
                 "check_in_time": "08:30", "check_out_time": "16:00", "notes": "ok"},
                {"student_id": students_a[1], "status": "Gelmedi"},
                {"student_id": students_a[2], "status": "Geç Kaldı", "check_in_time": "09:15"},
            ],
        }
        r = client_a.post(f"{BASE_URL}/api/attendance", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["date"] == date
        assert data["count"] == 3
        # _id never leaks
        assert all("_id" not in e for e in data["entries"])
        statuses = {e["student_id"]: e["status"] for e in data["entries"]}
        assert statuses[students_a[0]] == "Geldi"
        assert statuses[students_a[1]] == "Gelmedi"
        assert statuses[students_a[2]] == "Geç Kaldı"

    def test_get_attendance_day_returns_all_active_with_status(self, client_a, students_a):
        date = "2026-01-10"
        r = client_a.get(f"{BASE_URL}/api/attendance", params={"date": date})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["date"] == date
        entries_by_id = {e["student_id"]: e for e in data["entries"]}
        # all three test students appear
        for sid in students_a:
            assert sid in entries_by_id
        assert entries_by_id[students_a[0]]["status"] == "Geldi"
        assert entries_by_id[students_a[0]]["check_in_time"] == "08:30"
        assert entries_by_id[students_a[0]]["notes"] == "ok"
        assert entries_by_id[students_a[1]]["status"] == "Gelmedi"
        assert entries_by_id[students_a[2]]["status"] == "Geç Kaldı"
        assert all("_id" not in e for e in data["entries"])

    def test_get_attendance_day_status_null_when_unmarked(self, client_a):
        r = client_a.get(f"{BASE_URL}/api/attendance", params={"date": "2026-01-15"})
        assert r.status_code == 200
        # students exist but no marks for that date => status None
        for e in r.json()["entries"]:
            assert e["status"] is None

    def test_post_attendance_idempotent_update(self, client_a, students_a):
        date = "2026-01-10"
        # update student 1 from Geldi -> İzinli
        r = client_a.post(f"{BASE_URL}/api/attendance", json={
            "date": date,
            "entries": [{"student_id": students_a[0], "status": "İzinli", "notes": "doctor"}],
        })
        assert r.status_code == 200
        # Verify via GET that it persisted and DID NOT duplicate
        r2 = client_a.get(f"{BASE_URL}/api/attendance", params={"date": date})
        entries_by_id = {e["student_id"]: e for e in r2.json()["entries"]}
        assert entries_by_id[students_a[0]]["status"] == "İzinli"
        assert entries_by_id[students_a[0]]["notes"] == "doctor"
        # Others untouched
        assert entries_by_id[students_a[1]]["status"] == "Gelmedi"

    def test_post_attendance_invalid_enum_422(self, client_a, students_a):
        r = client_a.post(f"{BASE_URL}/api/attendance", json={
            "date": "2026-01-10",
            "entries": [{"student_id": students_a[0], "status": "Absent"}],
        })
        assert r.status_code == 422

    def test_post_attendance_skips_other_teacher_students(self, client_a, students_a, student_b):
        """Entries for students not owned by teacher are silently skipped (count reflects skip)."""
        r = client_a.post(f"{BASE_URL}/api/attendance", json={
            "date": "2026-01-11",
            "entries": [
                {"student_id": students_a[0], "status": "Geldi"},
                {"student_id": student_b, "status": "Geldi"},           # other teacher's
                {"student_id": "std_nonexistent_xyz", "status": "Geldi"},  # bogus
            ],
        })
        assert r.status_code == 200
        data = r.json()
        assert data["count"] == 1  # only students_a[0] matched
        sids = {e["student_id"] for e in data["entries"]}
        assert sids == {students_a[0]}


# ============================================================
# Attendance range (calendar aggregate)
# ============================================================

class TestAttendanceRange:
    def test_range_returns_per_day_counts(self, client_a, students_a):
        # ensure some marks on two days
        client_a.post(f"{BASE_URL}/api/attendance", json={
            "date": "2026-01-12",
            "entries": [
                {"student_id": students_a[0], "status": "Geldi"},
                {"student_id": students_a[1], "status": "Geldi"},
                {"student_id": students_a[2], "status": "Gelmedi"},
            ],
        })
        r = client_a.get(f"{BASE_URL}/api/attendance/range",
                         params={"start": "2026-01-01", "end": "2026-01-31"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["start"] == "2026-01-01"
        assert data["end"] == "2026-01-31"
        assert "total_students" in data
        assert isinstance(data["total_students"], int) and data["total_students"] >= 3
        day_map = {d["date"]: d for d in data["days"]}
        assert "2026-01-10" in day_map
        assert "2026-01-12" in day_map
        jan12 = day_map["2026-01-12"]
        for k in ("Geldi", "Gelmedi", "İzinli", "Geç Kaldı"):
            assert k in jan12
        assert jan12["Geldi"] == 2
        assert jan12["Gelmedi"] == 1
        assert jan12["total_students"] == data["total_students"]

    def test_range_requires_auth(self, anon_client):
        r = anon_client.get(f"{BASE_URL}/api/attendance/range",
                            params={"start": "2026-01-01", "end": "2026-01-31"})
        assert r.status_code == 401


# ============================================================
# Attendance per-student history
# ============================================================

class TestAttendanceStudent:
    def test_student_history_returns_entries(self, client_a, students_a):
        sid = students_a[0]
        r = client_a.get(f"{BASE_URL}/api/attendance/student/{sid}",
                         params={"start": "2026-01-01", "end": "2026-01-31"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["student_id"] == sid
        assert isinstance(data["entries"], list)
        assert len(data["entries"]) >= 2  # 01-10 (İzinli) + 01-12 (Geldi)
        assert all("_id" not in e for e in data["entries"])
        dates = [e["date"] for e in data["entries"]]
        # sorted desc
        assert dates == sorted(dates, reverse=True)

    def test_student_history_404_for_other_teacher(self, client_a, student_b):
        r = client_a.get(f"{BASE_URL}/api/attendance/student/{student_b}")
        assert r.status_code == 404

    def test_student_history_requires_auth(self, anon_client, students_a):
        r = anon_client.get(f"{BASE_URL}/api/attendance/student/{students_a[0]}")
        assert r.status_code == 401


# ============================================================
# Dashboard attendance_today
# ============================================================

class TestDashboardAttendanceToday:
    def test_dashboard_includes_attendance_today(self, client_a, students_a):
        today = datetime.now(timezone.utc).date().isoformat()
        # Post today's attendance: 2 present, 1 late
        r = client_a.post(f"{BASE_URL}/api/attendance", json={
            "date": today,
            "entries": [
                {"student_id": students_a[0], "status": "Geldi"},
                {"student_id": students_a[1], "status": "Geldi"},
                {"student_id": students_a[2], "status": "Geç Kaldı"},
            ],
        })
        assert r.status_code == 200
        r2 = client_a.get(f"{BASE_URL}/api/dashboard")
        assert r2.status_code == 200
        data = r2.json()
        assert "attendance_today" in data
        at = data["attendance_today"]
        assert at["date"] == today
        assert at["marked"] >= 3
        assert at["present"] >= 2
        assert at["late"] >= 1
        assert at["absent"] == 0
        assert at["excused"] == 0


# ============================================================
# Auth enforcement on all attendance endpoints
# ============================================================

class TestAttendanceAuth:
    def test_post_requires_auth(self, anon_client):
        r = anon_client.post(f"{BASE_URL}/api/attendance",
                             json={"date": "2026-01-01", "entries": []})
        assert r.status_code == 401

    def test_get_requires_auth(self, anon_client):
        r = anon_client.get(f"{BASE_URL}/api/attendance",
                            params={"date": "2026-01-01"})
        assert r.status_code == 401


# ============================================================
# Cleanup attendance docs after the module runs
# ============================================================

@pytest.fixture(scope="module", autouse=True)
def _cleanup_attendance(mongo_db, teacher_a, teacher_b):
    yield
    mongo_db.attendance.delete_many({"teacher_id": teacher_a["user_id"]})
    mongo_db.attendance.delete_many({"teacher_id": teacher_b["user_id"]})
