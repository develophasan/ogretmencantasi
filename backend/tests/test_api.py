"""
Backend API tests for Okul Öncesi Eğitim Yönetim Sistemi.
Covers: auth, class-settings, students CRUD, teacher isolation, reports, dashboard, _id leakage, auth enforcement.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://class-manager-183.preview.emergentagent.com').rstrip('/')


# ======================== AUTH ========================

class TestAuth:
    def test_auth_me_returns_user_profile(self, client_a, teacher_a):
        r = client_a.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user_id"] == teacher_a["user_id"]
        assert "email" in data and data["email"].startswith("TEST_")
        assert data["setup_completed"] is False
        assert "_id" not in data

    def test_auth_me_no_token_401(self, anon_client):
        r = anon_client.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401

    def test_auth_me_invalid_token_401(self, anon_client):
        r = anon_client.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": "Bearer bogus_token_xyz"})
        assert r.status_code == 401

    def test_auth_session_invalid_session_id(self, anon_client):
        # Real Emergent OAuth exchange will fail with random session_id
        r = anon_client.post(f"{BASE_URL}/api/auth/session", json={"session_id": "invalid_test_session"})
        assert r.status_code == 401

    def test_logout_clears_session(self, mongo_db):
        # Create dedicated user for logout test to not affect others
        from datetime import datetime, timezone, timedelta
        token = f"TEST_logout_{uuid.uuid4().hex[:12]}"
        user_id = f"TEST_logout_user_{uuid.uuid4().hex[:8]}"
        now = datetime.now(timezone.utc)
        mongo_db.users.insert_one({
            "user_id": user_id, "email": f"TEST_{user_id}@x.com", "name": "L",
            "school_name": None, "education_model": None,
            "class_schedule": {}, "setup_completed": False,
            "created_at": now.isoformat(),
        })
        mongo_db.user_sessions.insert_one({
            "user_id": user_id, "session_token": token,
            "expires_at": (now + timedelta(days=7)).isoformat(),
            "created_at": now.isoformat(),
        })
        s = requests.Session()
        s.headers.update({"Authorization": f"Bearer {token}"})
        r = s.post(f"{BASE_URL}/api/auth/logout")
        assert r.status_code == 200
        # session gone
        assert mongo_db.user_sessions.find_one({"session_token": token}) is None
        # token no longer works
        r2 = s.get(f"{BASE_URL}/api/auth/me")
        assert r2.status_code == 401
        mongo_db.users.delete_many({"user_id": user_id})


# ======================== CLASS SETTINGS ========================

class TestClassSettings:
    def test_get_empty_initially(self, client_a):
        r = client_a.get(f"{BASE_URL}/api/class-settings")
        assert r.status_code == 200
        data = r.json()
        assert "school_name" in data
        assert "class_schedule" in data
        assert "setup_completed" in data

    def test_put_updates_and_persists(self, client_a):
        payload = {
            "school_name": "TEST_Anaokulu",
            "education_model": "Maarif",
            "class_schedule": {
                "arrival_time": "08:30",
                "departure_time": "16:00",
                "breakfast_time": "09:00",
                "lunch_time": "12:30",
                "afternoon_snack_time": "15:00",
            },
            "setup_completed": True,
        }
        r = client_a.put(f"{BASE_URL}/api/class-settings", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["school_name"] == "TEST_Anaokulu"
        assert data["education_model"] == "Maarif"
        assert data["class_schedule"]["arrival_time"] == "08:30"
        assert data["setup_completed"] is True

        # GET to verify persistence
        r2 = client_a.get(f"{BASE_URL}/api/class-settings")
        assert r2.json()["school_name"] == "TEST_Anaokulu"
        assert r2.json()["class_schedule"]["lunch_time"] == "12:30"

    def test_class_settings_requires_auth(self, anon_client):
        r = anon_client.get(f"{BASE_URL}/api/class-settings")
        assert r.status_code == 401


# ======================== STUDENTS ========================

@pytest.fixture(scope="class")
def sample_student_payload():
    return {
        "first_name": "TEST_Ayşe",
        "last_name": "Yılmaz",
        "birth_date": "2020-05-15",
        "gender": "Kız",
        "tc_no": "12345678901",
        "parent_mother": {"name": "Anne Yılmaz", "phone": "555-0101", "relationship": "Anne"},
        "parent_father": {"name": "Baba Yılmaz", "phone": "555-0102", "relationship": "Baba"},
        "sibling_count": 1,
        "family_status": "Öz",
        "address": "İstanbul",
        "health": {"allergies": "Fıstık", "blood_type": "A+"},
        "notes": "Test student",
    }


class TestStudentsCRUD:
    def test_create_student_returns_full_model(self, client_a, teacher_a, sample_student_payload):
        r = client_a.post(f"{BASE_URL}/api/students", json=sample_student_payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["first_name"] == "TEST_Ayşe"
        assert data["gender"] == "Kız"
        assert data["teacher_id"] == teacher_a["user_id"]
        assert data["status"] == "Aktif"
        assert "id" in data and data["id"].startswith("std_")
        assert "enrollment_date" in data
        assert "created_at" in data
        assert "_id" not in data
        pytest.student_id_a = data["id"]

    def test_create_student_missing_required_fails(self, client_a):
        r = client_a.post(f"{BASE_URL}/api/students", json={"first_name": "X"})
        assert r.status_code == 422

    def test_list_students(self, client_a):
        r = client_a.get(f"{BASE_URL}/api/students")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        assert all("_id" not in s for s in data)

    def test_list_filter_by_status(self, client_a):
        r = client_a.get(f"{BASE_URL}/api/students", params={"status": "Aktif"})
        assert r.status_code == 200
        assert all(s["status"] == "Aktif" for s in r.json())

    def test_list_filter_by_search(self, client_a):
        r = client_a.get(f"{BASE_URL}/api/students", params={"search": "Ayşe"})
        assert r.status_code == 200
        assert any("Ayşe" in s["first_name"] for s in r.json())

    def test_get_student_by_id(self, client_a):
        sid = pytest.student_id_a
        r = client_a.get(f"{BASE_URL}/api/students/{sid}")
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == sid
        assert "_id" not in data

    def test_get_student_not_found(self, client_a):
        r = client_a.get(f"{BASE_URL}/api/students/std_nonexistent_xyz")
        assert r.status_code == 404

    def test_update_student_status_transition(self, client_a):
        sid = pytest.student_id_a
        r = client_a.put(f"{BASE_URL}/api/students/{sid}", json={"status": "Pasif", "notes": "Updated"})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "Pasif"
        # Persisted
        r2 = client_a.get(f"{BASE_URL}/api/students/{sid}")
        assert r2.json()["status"] == "Pasif"
        assert r2.json()["notes"] == "Updated"

    def test_teacher_isolation_cannot_read_other(self, client_a, client_b):
        # create student as B
        r = client_b.post(f"{BASE_URL}/api/students", json={
            "first_name": "TEST_B_kid", "last_name": "X", "birth_date": "2021-01-01", "gender": "Erkek"
        })
        assert r.status_code == 200
        b_sid = r.json()["id"]
        # A cannot GET it
        r2 = client_a.get(f"{BASE_URL}/api/students/{b_sid}")
        assert r2.status_code == 404
        # A cannot PUT it
        r3 = client_a.put(f"{BASE_URL}/api/students/{b_sid}", json={"notes": "hack"})
        assert r3.status_code == 404
        # A cannot DELETE it
        r4 = client_a.delete(f"{BASE_URL}/api/students/{b_sid}")
        assert r4.status_code == 404
        # B can still read it
        assert client_b.get(f"{BASE_URL}/api/students/{b_sid}").status_code == 200

    def test_delete_student(self, client_a):
        sid = pytest.student_id_a
        r = client_a.delete(f"{BASE_URL}/api/students/{sid}")
        assert r.status_code == 200
        r2 = client_a.get(f"{BASE_URL}/api/students/{sid}")
        assert r2.status_code == 404

    def test_students_requires_auth(self, anon_client):
        assert anon_client.get(f"{BASE_URL}/api/students").status_code == 401
        assert anon_client.post(f"{BASE_URL}/api/students", json={}).status_code == 401


# ======================== REPORTS ========================

class TestReports:
    def test_create_draft_with_8_sections(self, client_a):
        # create a student first
        r = client_a.post(f"{BASE_URL}/api/students", json={
            "first_name": "TEST_Rep", "last_name": "Child", "birth_date": "2020-02-02", "gender": "Erkek"
        })
        assert r.status_code == 200
        sid = r.json()["id"]

        r2 = client_a.post(f"{BASE_URL}/api/reports/draft", json={
            "student_id": sid, "start_date": "2026-01-01", "end_date": "2026-01-31"
        })
        assert r2.status_code == 200, r2.text
        data = r2.json()
        expected = {"social_emotional", "cognitive", "language", "motor",
                    "self_care", "creativity", "teacher_notes", "recommendations"}
        assert set(data["sections"].keys()) == expected
        assert all(data["sections"][k]["content"] == "" for k in expected)
        assert data["student_id"] == sid
        assert "_id" not in data
        pytest.report_student_id = sid

    def test_create_draft_other_teacher_student_404(self, client_a, client_b):
        rb = client_b.post(f"{BASE_URL}/api/students", json={
            "first_name": "TEST_BRep", "last_name": "K", "birth_date": "2020-02-02", "gender": "Kız"
        })
        b_sid = rb.json()["id"]
        r = client_a.post(f"{BASE_URL}/api/reports/draft", json={
            "student_id": b_sid, "start_date": "2026-01-01", "end_date": "2026-01-31"
        })
        assert r.status_code == 404

    def test_list_reports(self, client_a):
        r = client_a.get(f"{BASE_URL}/api/reports")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        assert all("_id" not in d for d in data)

    def test_reports_requires_auth(self, anon_client):
        assert anon_client.get(f"{BASE_URL}/api/reports").status_code == 401
        assert anon_client.post(f"{BASE_URL}/api/reports/draft", json={}).status_code == 401


# ======================== DASHBOARD ========================

class TestDashboard:
    def test_dashboard_counts_and_shape(self, client_a):
        r = client_a.get(f"{BASE_URL}/api/dashboard")
        assert r.status_code == 200, r.text
        data = r.json()
        counts = data["counts"]
        for k in ("total", "active", "passive", "girls", "boys", "with_allergy"):
            assert k in counts
            assert isinstance(counts[k], int)
        assert counts["total"] == counts["active"] + counts["passive"]
        assert "class_schedule" in data
        assert "recent_students" in data
        assert isinstance(data["recent_students"], list)
        assert all("_id" not in s for s in data["recent_students"])

    def test_dashboard_requires_auth(self, anon_client):
        assert anon_client.get(f"{BASE_URL}/api/dashboard").status_code == 401
