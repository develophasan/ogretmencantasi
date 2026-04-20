import os
import time
import uuid
import pytest
import requests
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://class-manager-183.preview.emergentagent.com').rstrip('/')
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')


@pytest.fixture(scope="session")
def mongo_db():
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


def _create_user_session(db, prefix="A"):
    user_id = f"TEST_user_{prefix}_{uuid.uuid4().hex[:8]}"
    session_token = f"TEST_sess_{prefix}_{uuid.uuid4().hex[:16]}"
    now = datetime.now(timezone.utc)
    db.users.insert_one({
        "user_id": user_id,
        "email": f"TEST_{user_id}@example.com",
        "name": f"Test Teacher {prefix}",
        "picture": None,
        "school_name": None,
        "education_model": None,
        "class_schedule": {
            "arrival_time": None, "departure_time": None,
            "breakfast_time": None, "lunch_time": None, "afternoon_snack_time": None,
        },
        "setup_completed": False,
        "created_at": now.isoformat(),
    })
    db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": (now + timedelta(days=7)).isoformat(),
        "created_at": now.isoformat(),
    })
    return user_id, session_token


@pytest.fixture(scope="session")
def teacher_a(mongo_db):
    user_id, token = _create_user_session(mongo_db, "A")
    yield {"user_id": user_id, "token": token}
    # teardown
    mongo_db.users.delete_many({"user_id": user_id})
    mongo_db.user_sessions.delete_many({"user_id": user_id})
    mongo_db.students.delete_many({"teacher_id": user_id})
    mongo_db.report_drafts.delete_many({"teacher_id": user_id})


@pytest.fixture(scope="session")
def teacher_b(mongo_db):
    user_id, token = _create_user_session(mongo_db, "B")
    yield {"user_id": user_id, "token": token}
    mongo_db.users.delete_many({"user_id": user_id})
    mongo_db.user_sessions.delete_many({"user_id": user_id})
    mongo_db.students.delete_many({"teacher_id": user_id})
    mongo_db.report_drafts.delete_many({"teacher_id": user_id})


@pytest.fixture(scope="session")
def client_a(teacher_a):
    s = requests.Session()
    s.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {teacher_a['token']}",
    })
    return s


@pytest.fixture(scope="session")
def client_b(teacher_b):
    s = requests.Session()
    s.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {teacher_b['token']}",
    })
    return s


@pytest.fixture(scope="session")
def anon_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s
