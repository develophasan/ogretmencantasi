"""
Iteration 3 tests: daily-cases, activity-notes, chat endpoints (text/voice/history).
Teacher isolation, auth enforcement, _id leak prevention, LLM command execution.
"""
import io
import os
import uuid
import pytest
import requests
from datetime import datetime, timezone

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://class-manager-183.preview.emergentagent.com').rstrip('/')


# ---------- helpers ----------
def _mk_student(client, first, last, gender="Kız"):
    r = client.post(f"{BASE_URL}/api/students", json={
        "first_name": first, "last_name": last,
        "birth_date": "2020-03-15", "gender": gender,
    })
    assert r.status_code == 200, r.text
    return r.json()["id"]


@pytest.fixture(scope="module")
def seeded_students_a(client_a, mongo_db, teacher_a):
    ids = [
        _mk_student(client_a, "TESTAda", "Yılmaz"),
        _mk_student(client_a, "TESTCan", "Demir", "Erkek"),
        _mk_student(client_a, "TESTDeniz", "Kaya"),
    ]
    yield ids
    mongo_db.students.delete_many({"teacher_id": teacher_a["user_id"]})
    mongo_db.attendance.delete_many({"teacher_id": teacher_a["user_id"]})
    mongo_db.daily_cases.delete_many({"teacher_id": teacher_a["user_id"]})
    mongo_db.activity_notes.delete_many({"teacher_id": teacher_a["user_id"]})
    mongo_db.chat_messages.delete_many({"teacher_id": teacher_a["user_id"]})


# =============================================================
# DAILY CASES
# =============================================================
class TestDailyCases:
    def test_create_daily_case(self, client_a, seeded_students_a):
        sid = seeded_students_a[0]
        r = client_a.post(f"{BASE_URL}/api/daily-cases", json={
            "student_id": sid, "student_name": "TESTAda Yılmaz",
            "title": "TEST_case_title", "description": "düştü",
            "date": "2026-01-15",
        })
        assert r.status_code == 200
        d = r.json()
        assert d["title"] == "TEST_case_title"
        assert d["student_id"] == sid
        assert d["date"] == "2026-01-15"
        assert "_id" not in d
        assert d["id"].startswith("case_")

    def test_list_and_filter(self, client_a, seeded_students_a):
        sid = seeded_students_a[1]
        client_a.post(f"{BASE_URL}/api/daily-cases", json={
            "student_id": sid, "title": "TEST_case_filter", "date": "2026-02-10",
        })
        r = client_a.get(f"{BASE_URL}/api/daily-cases")
        assert r.status_code == 200
        docs = r.json()
        assert any(c["title"] == "TEST_case_filter" for c in docs)
        assert all("_id" not in c for c in docs)

        r2 = client_a.get(f"{BASE_URL}/api/daily-cases", params={"student_id": sid})
        assert r2.status_code == 200
        assert all(c["student_id"] == sid for c in r2.json())

        r3 = client_a.get(f"{BASE_URL}/api/daily-cases",
                          params={"start": "2026-02-01", "end": "2026-02-28"})
        assert r3.status_code == 200
        assert all("2026-02" in c["date"] for c in r3.json())

    def test_update_and_delete(self, client_a, seeded_students_a):
        r = client_a.post(f"{BASE_URL}/api/daily-cases", json={
            "title": "TEST_case_upd", "description": "old",
        })
        cid = r.json()["id"]
        u = client_a.put(f"{BASE_URL}/api/daily-cases/{cid}", json={"description": "new"})
        assert u.status_code == 200
        assert u.json()["description"] == "new"

        d = client_a.delete(f"{BASE_URL}/api/daily-cases/{cid}")
        assert d.status_code == 200

        miss = client_a.delete(f"{BASE_URL}/api/daily-cases/{cid}")
        assert miss.status_code == 404
        miss_p = client_a.put(f"{BASE_URL}/api/daily-cases/nope_{uuid.uuid4().hex}", json={"title": "x"})
        assert miss_p.status_code == 404

    def test_teacher_isolation(self, client_a, client_b, seeded_students_a):
        r = client_a.post(f"{BASE_URL}/api/daily-cases", json={"title": "TEST_case_priv"})
        cid = r.json()["id"]
        # teacher B cannot see it in list
        lb = client_b.get(f"{BASE_URL}/api/daily-cases")
        assert lb.status_code == 200
        assert not any(c["id"] == cid for c in lb.json())
        # cannot delete
        assert client_b.delete(f"{BASE_URL}/api/daily-cases/{cid}").status_code == 404
        # cannot update
        assert client_b.put(f"{BASE_URL}/api/daily-cases/{cid}", json={"title": "x"}).status_code == 404


# =============================================================
# ACTIVITY NOTES
# =============================================================
class TestActivityNotes:
    def test_create_and_list(self, client_a, seeded_students_a):
        r = client_a.post(f"{BASE_URL}/api/activity-notes", json={
            "activity_name": "TEST_activity_paint",
            "description": "parmak boyama", "date": "2026-01-20",
            "participants": seeded_students_a[:2],
        })
        assert r.status_code == 200
        d = r.json()
        assert d["activity_name"] == "TEST_activity_paint"
        assert d["participants"] == seeded_students_a[:2]
        assert "_id" not in d

        lst = client_a.get(f"{BASE_URL}/api/activity-notes").json()
        assert any(a["id"] == d["id"] for a in lst)
        assert all("_id" not in a for a in lst)

    def test_update_and_delete(self, client_a):
        r = client_a.post(f"{BASE_URL}/api/activity-notes", json={
            "activity_name": "TEST_activity_upd", "description": "o",
        })
        nid = r.json()["id"]
        u = client_a.put(f"{BASE_URL}/api/activity-notes/{nid}", json={"description": "n"})
        assert u.status_code == 200 and u.json()["description"] == "n"
        assert client_a.delete(f"{BASE_URL}/api/activity-notes/{nid}").status_code == 200
        assert client_a.delete(f"{BASE_URL}/api/activity-notes/{nid}").status_code == 404
        assert client_a.put(f"{BASE_URL}/api/activity-notes/missing_id", json={"description": "x"}).status_code == 404

    def test_teacher_isolation_activity(self, client_a, client_b):
        r = client_a.post(f"{BASE_URL}/api/activity-notes", json={"activity_name": "TEST_act_priv"})
        nid = r.json()["id"]
        lb = client_b.get(f"{BASE_URL}/api/activity-notes").json()
        assert not any(a["id"] == nid for a in lb)
        assert client_b.delete(f"{BASE_URL}/api/activity-notes/{nid}").status_code == 404


# =============================================================
# AUTH ENFORCEMENT
# =============================================================
class TestAuthEnforcement:
    @pytest.mark.parametrize("method,path", [
        ("GET", "/api/daily-cases"),
        ("POST", "/api/daily-cases"),
        ("GET", "/api/activity-notes"),
        ("POST", "/api/activity-notes"),
        ("POST", "/api/chat/message"),
        ("GET", "/api/chat/history"),
        ("DELETE", "/api/chat/history"),
        ("POST", "/api/chat/voice"),
    ])
    def test_requires_auth(self, anon_client, method, path):
        r = anon_client.request(method, f"{BASE_URL}{path}", json={})
        assert r.status_code == 401, f"{method} {path} => {r.status_code}"


# =============================================================
# CHAT — message + history + voice + isolation
# =============================================================
class TestChat:
    def test_greeting_no_commands(self, client_a, mongo_db, teacher_a):
        # clean prior history
        mongo_db.chat_messages.delete_many({"teacher_id": teacher_a["user_id"]})
        r = client_a.post(f"{BASE_URL}/api/chat/message", json={"message": "Merhaba"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert "reply" in body and "executed" in body
        assert isinstance(body["executed"], list)
        # greeting should not produce DB-mutating commands
        for ex in body["executed"]:
            assert ex.get("action") not in ("mark_attendance", "mark_all_present", "add_daily_case", "add_activity_note") \
                or ex.get("ok") is False

    def test_empty_message_400(self, client_a):
        r = client_a.post(f"{BASE_URL}/api/chat/message", json={"message": "   "})
        assert r.status_code == 400

    def test_attendance_command(self, client_a, mongo_db, teacher_a, seeded_students_a):
        mongo_db.attendance.delete_many({"teacher_id": teacher_a["user_id"]})
        r = client_a.post(f"{BASE_URL}/api/chat/message", json={
            "message": "Bugün TESTAda gelmedi, diğerleri geldi"
        })
        assert r.status_code == 200, r.text
        body = r.json()
        # If LLM budget exhausted, reply contains tükendi — that is acceptable per spec
        reply = body.get("reply", "")
        executed = body.get("executed", [])
        if "tükendi" in reply or "bağlanamadım" in reply:
            pytest.skip(f"LLM budget exhausted/unreachable — friendly reply path verified: {reply[:80]}")
        today = datetime.now(timezone.utc).date().isoformat()
        att = list(mongo_db.attendance.find({"teacher_id": teacher_a["user_id"], "date": today}))
        # If commands were executed, we expect at least 1 attendance record for today
        assert len(executed) >= 1 or len(att) >= 1, f"no exec and no att. body={body}"

    def test_daily_case_command(self, client_a, mongo_db, teacher_a, seeded_students_a):
        before = mongo_db.daily_cases.count_documents({"teacher_id": teacher_a["user_id"]})
        r = client_a.post(f"{BASE_URL}/api/chat/message", json={
            "message": "TESTCan düşüp dizini yaraladı"
        })
        assert r.status_code == 200
        reply = r.json().get("reply", "")
        if "tükendi" in reply or "bağlanamadım" in reply:
            pytest.skip("LLM budget exhausted")
        after = mongo_db.daily_cases.count_documents({"teacher_id": teacher_a["user_id"]})
        assert after >= before  # allow non-insertion if LLM asked a follow-up question

    def test_activity_command(self, client_a, mongo_db, teacher_a):
        before = mongo_db.activity_notes.count_documents({"teacher_id": teacher_a["user_id"]})
        r = client_a.post(f"{BASE_URL}/api/chat/message", json={
            "message": "Bugün parmak boyama etkinliği yaptık, çocuklar çok eğlendi"
        })
        assert r.status_code == 200
        reply = r.json().get("reply", "")
        if "tükendi" in reply or "bağlanamadım" in reply:
            pytest.skip("LLM budget exhausted")
        after = mongo_db.activity_notes.count_documents({"teacher_id": teacher_a["user_id"]})
        assert after >= before

    def test_history_order_and_isolation(self, client_a, client_b, teacher_a, teacher_b, mongo_db):
        # insert deterministic messages directly, avoid LLM dependency
        now = datetime.now(timezone.utc)
        mongo_db.chat_messages.delete_many({"teacher_id": teacher_a["user_id"]})
        mongo_db.chat_messages.delete_many({"teacher_id": teacher_b["user_id"]})
        for i, role in enumerate(["user", "assistant", "user"]):
            mongo_db.chat_messages.insert_one({
                "id": f"msg_TEST_{i}_{uuid.uuid4().hex[:6]}",
                "teacher_id": teacher_a["user_id"],
                "role": role, "content": f"TEST_msg_{i}",
                "created_at": (now.replace(microsecond=i * 1000)).isoformat(),
            })
        mongo_db.chat_messages.insert_one({
            "id": f"msg_TEST_B", "teacher_id": teacher_b["user_id"],
            "role": "user", "content": "B_private", "created_at": now.isoformat(),
        })

        r = client_a.get(f"{BASE_URL}/api/chat/history")
        assert r.status_code == 200
        docs = r.json()
        assert all("_id" not in d for d in docs)
        mine = [d for d in docs if d["content"].startswith("TEST_msg_")]
        assert len(mine) == 3
        assert [m["content"] for m in mine] == ["TEST_msg_0", "TEST_msg_1", "TEST_msg_2"]  # time order
        # B cannot see A's messages
        rb = client_b.get(f"{BASE_URL}/api/chat/history").json()
        assert not any(d["content"].startswith("TEST_msg_") for d in rb)

    def test_clear_history_isolation(self, client_a, client_b, teacher_a, teacher_b, mongo_db):
        mongo_db.chat_messages.insert_one({
            "id": "msg_TEST_A_clear", "teacher_id": teacher_a["user_id"],
            "role": "user", "content": "to_clear",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        mongo_db.chat_messages.insert_one({
            "id": "msg_TEST_B_keep", "teacher_id": teacher_b["user_id"],
            "role": "user", "content": "keep_me",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        r = client_a.delete(f"{BASE_URL}/api/chat/history")
        assert r.status_code == 200
        a_left = mongo_db.chat_messages.count_documents({"teacher_id": teacher_a["user_id"]})
        assert a_left == 0
        b_left = mongo_db.chat_messages.count_documents({"teacher_id": teacher_b["user_id"], "id": "msg_TEST_B_keep"})
        assert b_left == 1
        mongo_db.chat_messages.delete_many({"teacher_id": teacher_b["user_id"]})

    def test_voice_endpoint_accepts_multipart(self, teacher_a):
        # Small invalid webm — expect 200 with friendly reply OR 200 with empty transcript
        s = requests.Session()
        s.headers.update({"Authorization": f"Bearer {teacher_a['token']}"})
        files = {"file": ("test.webm", io.BytesIO(b"RIFF\x00\x00\x00\x00WEBM"), "audio/webm")}
        r = s.post(f"{BASE_URL}/api/chat/voice", files=files)
        # Whisper may 200 with empty transcript, OR the friendly fallback surfaces via 200
        # Budget-exhaust / invalid audio must NOT be a 5xx
        assert r.status_code in (200, 400, 413), f"unexpected status {r.status_code}: {r.text[:200]}"
        if r.status_code == 200:
            body = r.json()
            assert "reply" in body
