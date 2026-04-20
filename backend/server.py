from fastapi import FastAPI, APIRouter, Request, Response, HTTPException, Depends, Query, UploadFile, File
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import json
import tempfile
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal, Any
import uuid
from datetime import datetime, timezone, timedelta
import httpx
from emergentintegrations.llm.chat import LlmChat, UserMessage
from emergentintegrations.llm.openai import OpenAISpeechToText


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="Okul Öncesi Eğitim Yönetim Sistemi")
api_router = APIRouter(prefix="/api")

EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

# ============================================================
# MODELS
# ============================================================

class ClassSchedule(BaseModel):
    class_type: Optional[Literal["Tam Gün", "Yarım Gün"]] = None
    shift: Optional[Literal["Sabahçı", "Öğleci"]] = None   # only when Yarım Gün
    arrival_time: Optional[str] = None       # "08:30"
    departure_time: Optional[str] = None     # "16:00"
    breakfast_time: Optional[str] = None
    lunch_time: Optional[str] = None
    afternoon_snack_time: Optional[str] = None


class Teacher(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    school_name: Optional[str] = None
    education_model: Optional[Literal["Maarif", "ECE"]] = None
    class_schedule: ClassSchedule = Field(default_factory=ClassSchedule)
    setup_completed: bool = False
    created_at: datetime


class ClassSettingsUpdate(BaseModel):
    school_name: Optional[str] = None
    education_model: Optional[Literal["Maarif", "ECE"]] = None
    class_schedule: Optional[ClassSchedule] = None
    setup_completed: Optional[bool] = None


class ParentInfo(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    relationship: Optional[str] = None  # Anne/Baba/Vasi


class HealthInfo(BaseModel):
    allergies: Optional[str] = None
    chronic_diseases: Optional[str] = None
    medications: Optional[str] = None
    special_notes: Optional[str] = None
    blood_type: Optional[str] = None


class StudentBase(BaseModel):
    # Required
    first_name: str
    last_name: str
    birth_date: str          # ISO date
    gender: Literal["Kız", "Erkek"]
    # Optional
    tc_no: Optional[str] = None
    parent_mother: Optional[ParentInfo] = None
    parent_father: Optional[ParentInfo] = None
    emergency_contact: Optional[ParentInfo] = None
    sibling_count: Optional[int] = 0
    family_status: Optional[Literal["Öz", "Üvey", "Tek Ebeveyn", "Vasi"]] = None
    address: Optional[str] = None
    previous_school: Optional[str] = None
    health: Optional[HealthInfo] = None
    notes: Optional[str] = None
    photo_url: Optional[str] = None


class StudentCreate(StudentBase):
    pass


class StudentUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    birth_date: Optional[str] = None
    gender: Optional[Literal["Kız", "Erkek"]] = None
    tc_no: Optional[str] = None
    parent_mother: Optional[ParentInfo] = None
    parent_father: Optional[ParentInfo] = None
    emergency_contact: Optional[ParentInfo] = None
    sibling_count: Optional[int] = None
    family_status: Optional[Literal["Öz", "Üvey", "Tek Ebeveyn", "Vasi"]] = None
    address: Optional[str] = None
    previous_school: Optional[str] = None
    health: Optional[HealthInfo] = None
    notes: Optional[str] = None
    photo_url: Optional[str] = None
    status: Optional[Literal["Aktif", "Pasif"]] = None


class Student(StudentBase):
    id: str
    teacher_id: str
    status: Literal["Aktif", "Pasif"] = "Aktif"
    enrollment_date: str
    created_at: datetime
    updated_at: datetime


class SessionRequest(BaseModel):
    session_id: str


class ReportDraftRequest(BaseModel):
    student_id: str
    start_date: str
    end_date: str


# ============================================================
# AUTH HELPERS
# ============================================================

async def get_current_user(request: Request) -> dict:
    """Get current user from session_token cookie OR Authorization header."""
    session_token = request.cookies.get("session_token")
    if not session_token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            session_token = auth_header[7:]
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    session = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")

    expires_at = session["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")

    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# ============================================================
# AUTH ROUTES
# ============================================================

@api_router.post("/auth/session")
async def create_session(body: SessionRequest, response: Response):
    """Exchange Emergent session_id for our session_token, set httpOnly cookie."""
    async with httpx.AsyncClient(timeout=15.0) as http:
        r = await http.get(
            EMERGENT_SESSION_URL,
            headers={"X-Session-ID": body.session_id},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session_id")
    data = r.json()

    email = data["email"]
    name = data["name"]
    picture = data.get("picture")
    session_token = data["session_token"]

    # Upsert user
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": name, "picture": picture}},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "school_name": None,
            "education_model": None,
            "class_schedule": {
                "class_type": None,
                "shift": None,
                "arrival_time": None,
                "departure_time": None,
                "breakfast_time": None,
                "lunch_time": None,
                "afternoon_snack_time": None,
            },
            "setup_completed": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    # Store session
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=7 * 24 * 60 * 60,
        path="/",
    )
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    user = _serialize_user(user)
    return {"user": user}


@api_router.get("/auth/me")
async def auth_me(user: dict = Depends(get_current_user)):
    return _serialize_user(user)


@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    session_token = request.cookies.get("session_token")
    if not session_token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            session_token = auth_header[7:]
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    response.delete_cookie("session_token", path="/", samesite="none", secure=True)
    return {"ok": True}


def _serialize_user(user: dict) -> dict:
    out = {
        "user_id": user["user_id"],
        "email": user["email"],
        "name": user["name"],
        "picture": user.get("picture"),
        "school_name": user.get("school_name"),
        "education_model": user.get("education_model"),
        "class_schedule": user.get("class_schedule") or {},
        "setup_completed": user.get("setup_completed", False),
    }
    return out


# ============================================================
# CLASS SETTINGS
# ============================================================

@api_router.get("/class-settings")
async def get_class_settings(user: dict = Depends(get_current_user)):
    return {
        "school_name": user.get("school_name"),
        "education_model": user.get("education_model"),
        "class_schedule": user.get("class_schedule") or {},
        "setup_completed": user.get("setup_completed", False),
    }


@api_router.put("/class-settings")
async def update_class_settings(
    body: ClassSettingsUpdate,
    user: dict = Depends(get_current_user),
):
    update = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if "class_schedule" in update and update["class_schedule"] is not None:
        update["class_schedule"] = body.class_schedule.model_dump()
    if update:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": update})
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return {
        "school_name": fresh.get("school_name"),
        "education_model": fresh.get("education_model"),
        "class_schedule": fresh.get("class_schedule") or {},
        "setup_completed": fresh.get("setup_completed", False),
    }


# ============================================================
# STUDENTS
# ============================================================

def _student_doc_to_model(doc: dict) -> dict:
    # Convert ISO datetime strings back to datetime for response
    for k in ("created_at", "updated_at"):
        v = doc.get(k)
        if isinstance(v, str):
            doc[k] = datetime.fromisoformat(v)
    return doc


@api_router.post("/students", response_model=Student)
async def create_student(body: StudentCreate, user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    student_id = f"std_{uuid.uuid4().hex[:12]}"
    doc = body.model_dump()
    doc.update({
        "id": student_id,
        "teacher_id": user["user_id"],
        "status": "Aktif",
        "enrollment_date": now.date().isoformat(),
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    })
    await db.students.insert_one(doc.copy())
    doc.pop("_id", None)
    return _student_doc_to_model(doc)


@api_router.get("/students", response_model=List[Student])
async def list_students(
    status: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    user: dict = Depends(get_current_user),
):
    q: dict = {"teacher_id": user["user_id"]}
    if status:
        q["status"] = status
    if search:
        q["$or"] = [
            {"first_name": {"$regex": search, "$options": "i"}},
            {"last_name": {"$regex": search, "$options": "i"}},
        ]
    docs = await db.students.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [_student_doc_to_model(d) for d in docs]


@api_router.get("/students/{student_id}", response_model=Student)
async def get_student(student_id: str, user: dict = Depends(get_current_user)):
    doc = await db.students.find_one(
        {"id": student_id, "teacher_id": user["user_id"]}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Öğrenci bulunamadı")
    return _student_doc_to_model(doc)


@api_router.put("/students/{student_id}", response_model=Student)
async def update_student(
    student_id: str, body: StudentUpdate, user: dict = Depends(get_current_user)
):
    update = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.students.update_one(
        {"id": student_id, "teacher_id": user["user_id"]},
        {"$set": update},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Öğrenci bulunamadı")
    doc = await db.students.find_one(
        {"id": student_id, "teacher_id": user["user_id"]}, {"_id": 0}
    )
    return _student_doc_to_model(doc)


@api_router.delete("/students/{student_id}")
async def delete_student(student_id: str, user: dict = Depends(get_current_user)):
    result = await db.students.delete_one(
        {"id": student_id, "teacher_id": user["user_id"]}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Öğrenci bulunamadı")
    return {"ok": True}


# ============================================================
# REPORTS (empty draft)
# ============================================================

@api_router.post("/reports/draft")
async def create_report_draft(
    body: ReportDraftRequest, user: dict = Depends(get_current_user)
):
    student = await db.students.find_one(
        {"id": body.student_id, "teacher_id": user["user_id"]}, {"_id": 0}
    )
    if not student:
        raise HTTPException(status_code=404, detail="Öğrenci bulunamadı")

    draft = {
        "id": f"rep_{uuid.uuid4().hex[:12]}",
        "teacher_id": user["user_id"],
        "student_id": body.student_id,
        "student_name": f"{student['first_name']} {student['last_name']}",
        "period": {"start": body.start_date, "end": body.end_date},
        "sections": {
            "social_emotional": {"title": "Sosyal-Duygusal Gelişim", "content": ""},
            "cognitive": {"title": "Bilişsel Gelişim", "content": ""},
            "language": {"title": "Dil Gelişimi", "content": ""},
            "motor": {"title": "Motor Gelişim", "content": ""},
            "self_care": {"title": "Öz Bakım", "content": ""},
            "creativity": {"title": "Yaratıcılık ve Sanat", "content": ""},
            "teacher_notes": {"title": "Öğretmen Notları", "content": ""},
            "recommendations": {"title": "Aileye Öneriler", "content": ""},
        },
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.report_drafts.insert_one(draft.copy())
    draft.pop("_id", None)
    return draft


@api_router.get("/reports")
async def list_reports(user: dict = Depends(get_current_user)):
    docs = await db.report_drafts.find(
        {"teacher_id": user["user_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    return docs


# ============================================================
# ATTENDANCE / YOKLAMA
# ============================================================

class AttendanceEntry(BaseModel):
    student_id: str
    status: Literal["Geldi", "Gelmedi", "İzinli", "Geç Kaldı"]
    notes: Optional[str] = None
    check_in_time: Optional[str] = None      # "HH:MM"
    check_out_time: Optional[str] = None


class AttendanceDayRequest(BaseModel):
    date: str               # "YYYY-MM-DD"
    entries: List[AttendanceEntry]


@api_router.post("/attendance")
async def upsert_attendance_day(
    body: AttendanceDayRequest, user: dict = Depends(get_current_user)
):
    teacher_id = user["user_id"]
    now_iso = datetime.now(timezone.utc).isoformat()

    # Verify each student belongs to teacher
    student_ids = [e.student_id for e in body.entries]
    valid_ids = set()
    if student_ids:
        cursor = db.students.find(
            {"teacher_id": teacher_id, "id": {"$in": student_ids}},
            {"_id": 0, "id": 1},
        )
        async for s in cursor:
            valid_ids.add(s["id"])

    results = []
    for e in body.entries:
        if e.student_id not in valid_ids:
            continue
        doc = {
            "teacher_id": teacher_id,
            "student_id": e.student_id,
            "date": body.date,
            "status": e.status,
            "notes": e.notes,
            "check_in_time": e.check_in_time,
            "check_out_time": e.check_out_time,
            "updated_at": now_iso,
        }
        await db.attendance.update_one(
            {"teacher_id": teacher_id, "student_id": e.student_id, "date": body.date},
            {"$set": doc, "$setOnInsert": {"created_at": now_iso, "id": f"att_{uuid.uuid4().hex[:12]}"}},
            upsert=True,
        )
        results.append({**doc})
    return {"date": body.date, "count": len(results), "entries": results}


@api_router.get("/attendance")
async def get_attendance_day(
    date_str: str = Query(..., alias="date", description="YYYY-MM-DD"),
    user: dict = Depends(get_current_user),
):
    """Returns all active students with their attendance for a given date."""
    teacher_id = user["user_id"]
    students = await db.students.find(
        {"teacher_id": teacher_id, "status": "Aktif"}, {"_id": 0}
    ).sort("first_name", 1).to_list(1000)

    att_docs = await db.attendance.find(
        {"teacher_id": teacher_id, "date": date_str}, {"_id": 0}
    ).to_list(1000)
    by_student = {a["student_id"]: a for a in att_docs}

    entries = []
    for s in students:
        a = by_student.get(s["id"])
        entries.append({
            "student_id": s["id"],
            "first_name": s["first_name"],
            "last_name": s["last_name"],
            "gender": s["gender"],
            "status": a["status"] if a else None,
            "notes": a.get("notes") if a else None,
            "check_in_time": a.get("check_in_time") if a else None,
            "check_out_time": a.get("check_out_time") if a else None,
        })
    return {"date": date_str, "entries": entries}


@api_router.get("/attendance/range")
async def get_attendance_range(
    start: str = Query(...), end: str = Query(...),
    user: dict = Depends(get_current_user),
):
    """Per-day aggregated counts for calendar heatmap."""
    teacher_id = user["user_id"]
    total_students = await db.students.count_documents(
        {"teacher_id": teacher_id, "status": "Aktif"}
    )
    pipeline = [
        {"$match": {
            "teacher_id": teacher_id,
            "date": {"$gte": start, "$lte": end},
        }},
        {"$group": {
            "_id": {"date": "$date", "status": "$status"},
            "count": {"$sum": 1},
        }},
    ]
    rows = await db.attendance.aggregate(pipeline).to_list(10000)
    by_date: dict = {}
    for r in rows:
        d = r["_id"]["date"]
        s = r["_id"]["status"]
        by_date.setdefault(d, {"Geldi": 0, "Gelmedi": 0, "İzinli": 0, "Geç Kaldı": 0})
        by_date[d][s] = r["count"]
    days = [{"date": d, **counts, "total_students": total_students} for d, counts in by_date.items()]
    return {"start": start, "end": end, "total_students": total_students, "days": days}


@api_router.get("/attendance/student/{student_id}")
async def get_attendance_student(
    student_id: str,
    start: Optional[str] = Query(default=None),
    end: Optional[str] = Query(default=None),
    user: dict = Depends(get_current_user),
):
    teacher_id = user["user_id"]
    student = await db.students.find_one(
        {"id": student_id, "teacher_id": teacher_id}, {"_id": 0}
    )
    if not student:
        raise HTTPException(status_code=404, detail="Öğrenci bulunamadı")
    q = {"teacher_id": teacher_id, "student_id": student_id}
    if start or end:
        q["date"] = {}
        if start:
            q["date"]["$gte"] = start
        if end:
            q["date"]["$lte"] = end
    docs = await db.attendance.find(q, {"_id": 0}).sort("date", -1).to_list(2000)
    return {"student_id": student_id, "entries": docs}


# ============================================================
# DASHBOARD SUMMARY
# ============================================================

@api_router.get("/dashboard")
async def get_dashboard(user: dict = Depends(get_current_user)):
    teacher_id = user["user_id"]
    total = await db.students.count_documents({"teacher_id": teacher_id})
    active = await db.students.count_documents({"teacher_id": teacher_id, "status": "Aktif"})
    passive = total - active

    # Gender breakdown
    kiz = await db.students.count_documents({"teacher_id": teacher_id, "gender": "Kız"})
    erkek = await db.students.count_documents({"teacher_id": teacher_id, "gender": "Erkek"})

    # With allergies
    with_allergy = await db.students.count_documents({
        "teacher_id": teacher_id,
        "health.allergies": {"$nin": [None, ""]},
    })

    recent_docs = await db.students.find(
        {"teacher_id": teacher_id}, {"_id": 0}
    ).sort("created_at", -1).limit(5).to_list(5)

    # Today's attendance summary
    today = datetime.now(timezone.utc).date().isoformat()
    att_today_rows = await db.attendance.find(
        {"teacher_id": teacher_id, "date": today}, {"_id": 0}
    ).to_list(1000)
    att_counts = {"Geldi": 0, "Gelmedi": 0, "İzinli": 0, "Geç Kaldı": 0}
    for a in att_today_rows:
        if a["status"] in att_counts:
            att_counts[a["status"]] += 1
    attendance_today = {
        "date": today,
        "marked": len(att_today_rows),
        "present": att_counts["Geldi"],
        "absent": att_counts["Gelmedi"],
        "excused": att_counts["İzinli"],
        "late": att_counts["Geç Kaldı"],
    }

    return {
        "counts": {
            "total": total,
            "active": active,
            "passive": passive,
            "girls": kiz,
            "boys": erkek,
            "with_allergy": with_allergy,
        },
        "class_schedule": user.get("class_schedule") or {},
        "education_model": user.get("education_model"),
        "school_name": user.get("school_name"),
        "recent_students": [_student_doc_to_model(d) for d in recent_docs],
        "attendance_today": attendance_today,
    }


# ============================================================
# DAILY CASES / GÜNLÜK VAKALAR
# ============================================================


class DailyCaseCreate(BaseModel):
    student_id: Optional[str] = None
    student_name: Optional[str] = None
    title: str
    description: Optional[str] = None
    date: Optional[str] = None  # YYYY-MM-DD; defaults to today


class DailyCaseUpdate(BaseModel):
    student_id: Optional[str] = None
    student_name: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    date: Optional[str] = None


@api_router.post("/daily-cases")
async def create_daily_case(body: DailyCaseCreate, user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    doc = {
        "id": f"case_{uuid.uuid4().hex[:12]}",
        "teacher_id": user["user_id"],
        "student_id": body.student_id,
        "student_name": body.student_name,
        "title": body.title,
        "description": body.description,
        "date": body.date or now.date().isoformat(),
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }
    await db.daily_cases.insert_one(doc.copy())
    doc.pop("_id", None)
    return doc


@api_router.get("/daily-cases")
async def list_daily_cases(
    student_id: Optional[str] = Query(default=None),
    start: Optional[str] = Query(default=None),
    end: Optional[str] = Query(default=None),
    user: dict = Depends(get_current_user),
):
    q = {"teacher_id": user["user_id"]}
    if student_id:
        q["student_id"] = student_id
    if start or end:
        q["date"] = {}
        if start:
            q["date"]["$gte"] = start
        if end:
            q["date"]["$lte"] = end
    docs = await db.daily_cases.find(q, {"_id": 0}).sort("date", -1).to_list(500)
    return docs


@api_router.put("/daily-cases/{case_id}")
async def update_daily_case(case_id: str, body: DailyCaseUpdate, user: dict = Depends(get_current_user)):
    upd = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    upd["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.daily_cases.update_one(
        {"id": case_id, "teacher_id": user["user_id"]}, {"$set": upd}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Vaka bulunamadı")
    doc = await db.daily_cases.find_one({"id": case_id, "teacher_id": user["user_id"]}, {"_id": 0})
    return doc


@api_router.delete("/daily-cases/{case_id}")
async def delete_daily_case(case_id: str, user: dict = Depends(get_current_user)):
    result = await db.daily_cases.delete_one({"id": case_id, "teacher_id": user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Vaka bulunamadı")
    return {"ok": True}


# ============================================================
# ACTIVITY NOTES / ETKİNLİK NOTLARI
# ============================================================


class ActivityNoteCreate(BaseModel):
    activity_name: str
    description: Optional[str] = None
    date: Optional[str] = None
    participants: Optional[List[str]] = None  # student_ids


class ActivityNoteUpdate(BaseModel):
    activity_name: Optional[str] = None
    description: Optional[str] = None
    date: Optional[str] = None
    participants: Optional[List[str]] = None


@api_router.post("/activity-notes")
async def create_activity_note(body: ActivityNoteCreate, user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    doc = {
        "id": f"act_{uuid.uuid4().hex[:12]}",
        "teacher_id": user["user_id"],
        "activity_name": body.activity_name,
        "description": body.description,
        "date": body.date or now.date().isoformat(),
        "participants": body.participants or [],
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }
    await db.activity_notes.insert_one(doc.copy())
    doc.pop("_id", None)
    return doc


@api_router.get("/activity-notes")
async def list_activity_notes(
    start: Optional[str] = Query(default=None),
    end: Optional[str] = Query(default=None),
    user: dict = Depends(get_current_user),
):
    q = {"teacher_id": user["user_id"]}
    if start or end:
        q["date"] = {}
        if start:
            q["date"]["$gte"] = start
        if end:
            q["date"]["$lte"] = end
    docs = await db.activity_notes.find(q, {"_id": 0}).sort("date", -1).to_list(500)
    return docs


@api_router.put("/activity-notes/{note_id}")
async def update_activity_note(note_id: str, body: ActivityNoteUpdate, user: dict = Depends(get_current_user)):
    upd = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    upd["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.activity_notes.update_one(
        {"id": note_id, "teacher_id": user["user_id"]}, {"$set": upd}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not bulunamadı")
    doc = await db.activity_notes.find_one({"id": note_id, "teacher_id": user["user_id"]}, {"_id": 0})
    return doc


@api_router.delete("/activity-notes/{note_id}")
async def delete_activity_note(note_id: str, user: dict = Depends(get_current_user)):
    result = await db.activity_notes.delete_one({"id": note_id, "teacher_id": user["user_id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not bulunamadı")
    return {"ok": True}


# ============================================================
# CHAT ASISTAN
# ============================================================

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")

SYSTEM_PROMPT = """Sen "Asistan"sın. Türkiye'de bir okul öncesi öğretmeni için çalışıyorsun.
GÖREVİN SADECE: öğretmenin söylediği/yazdığı veriyi, VERİTABANINA DOĞRU ŞEKİLDE KAYDETMEK.

KURALLAR (kesin):
1) SADECE GEÇERLİ JSON ÇIKTISI ÜRET. Başka hiçbir metin, açıklama, selam, öneri, özet VERME.
2) ÇIKTI ŞEMASI (tek seviye):
{
  "reply": "Çok kısa Türkçe onay ya da eksik bilgi sorusu (maks 1 cümle).",
  "commands": [ { "action": "<ad>", "args": { ... } }, ... ]
}
3) Eğer bilgi eksikse SORU sor (reply alanında), commands boş liste olsun. Örn: "Hangi öğrenci?" / "Etkinlik adı nedir?"
4) ASLA tavsiye / yorum / detaylı açıklama yazma. Öneri verme. Fazladan cümle yok.
5) Öğrenci adı geçerse tam isim veya parçalı isim farketmez; eşleşmeyi backend yapar. Sen adı 'student_name' olarak ilet.
6) Desteklenen action değerleri VE args şemaları:
   - "mark_attendance": { "date": "YYYY-MM-DD (verilmezse bugün)", "entries": [ { "student_name": "...", "status": "Geldi|Gelmedi|Geç Kaldı|İzinli", "notes": "opsiyonel" } ] }
   - "mark_all_present": { "date": "YYYY-MM-DD (opsiyonel)" }  // istisnalar varsa entries alanı ile bildir
   - "add_daily_case": { "student_name": "opsiyonel", "title": "kısa başlık", "description": "ayrıntı", "date": "YYYY-MM-DD (opsiyonel)" }
   - "add_activity_note": { "activity_name": "...", "description": "...", "date": "YYYY-MM-DD (opsiyonel)" }
7) Birden fazla öğrenci için tek seferde commands tek bir mark_attendance içinde entries listesinde topla.
8) Tarih verilmezse sistemin verdiği 'today' değerini kullan.
9) Eğer kullanıcı selam verir ya da sorar ("nasılsın", "merhaba") SADECE kısaca yanıt ver, commands boş bırak. Örn: {"reply":"Buradayım. Yoklama, günlük vaka veya etkinlik notu için söyleyin.","commands":[]}
10) Kullanıcı yoklamada gelmeyen öğrencileri söyler ve "geri kalanı geldi" derse, önce mark_all_present kullan; belirtilen gelmeyenleri de mark_attendance ile Gelmedi olarak ekle.
11) KESİNLİKLE MARKDOWN KULLANMA. Sadece JSON döndür, başka hiçbir şey.
"""


class ChatRequest(BaseModel):
    message: str


async def _build_context(user: dict) -> str:
    teacher_id = user["user_id"]
    today = datetime.now(timezone.utc).date().isoformat()
    students = await db.students.find(
        {"teacher_id": teacher_id, "status": "Aktif"}, {"_id": 0, "id": 1, "first_name": 1, "last_name": 1}
    ).to_list(1000)
    student_list = ", ".join([f"{s['first_name']} {s['last_name']}" for s in students]) or "(henüz öğrenci yok)"

    att_today = await db.attendance.find(
        {"teacher_id": teacher_id, "date": today}, {"_id": 0}
    ).to_list(1000)
    att_summary = f"{len(att_today)} öğrenci işaretlendi" if att_today else "Bugün yoklama alınmadı"

    cs = user.get("class_schedule") or {}
    shift_info = ""
    if cs.get("class_type"):
        shift_info = cs["class_type"]
        if cs.get("shift"):
            shift_info += f" · {cs['shift']}"
        shift_info += f" · Giriş {cs.get('arrival_time') or '—'} / Çıkış {cs.get('departure_time') or '—'}"

    return (
        f"BUGÜN: {today}\n"
        f"VARDİYA: {shift_info}\n"
        f"AKTİF ÖĞRENCİLER: {student_list}\n"
        f"BUGÜN YOKLAMA: {att_summary}"
    )


def _find_student_by_name(students: List[dict], name: str) -> Optional[dict]:
    if not name:
        return None
    n = name.strip().casefold()
    # Exact full-name match first
    for s in students:
        full = f"{s['first_name']} {s['last_name']}".casefold()
        if full == n:
            return s
    # First name match
    for s in students:
        if s["first_name"].casefold() == n:
            return s
    # Last name match
    for s in students:
        if s["last_name"].casefold() == n:
            return s
    # Partial
    for s in students:
        full = f"{s['first_name']} {s['last_name']}".casefold()
        if n in full or full in n:
            return s
    return None


async def _execute_commands(teacher_id: str, commands: List[dict]) -> List[dict]:
    results: List[dict] = []
    students = await db.students.find(
        {"teacher_id": teacher_id, "status": "Aktif"}, {"_id": 0}
    ).to_list(1000)
    today = datetime.now(timezone.utc).date().isoformat()

    for cmd in commands or []:
        action = cmd.get("action")
        args = cmd.get("args") or {}
        try:
            if action == "mark_attendance":
                date_s = args.get("date") or today
                entries_in = args.get("entries") or []
                entries_out = []
                unknown = []
                for e in entries_in:
                    sid = e.get("student_id")
                    name = e.get("student_name")
                    matched = None
                    if sid:
                        matched = next((s for s in students if s["id"] == sid), None)
                    if not matched and name:
                        matched = _find_student_by_name(students, name)
                    if not matched:
                        unknown.append(name or sid or "?")
                        continue
                    status = e.get("status")
                    if status not in ("Geldi", "Gelmedi", "İzinli", "Geç Kaldı"):
                        continue
                    now_iso = datetime.now(timezone.utc).isoformat()
                    doc = {
                        "teacher_id": teacher_id,
                        "student_id": matched["id"],
                        "date": date_s,
                        "status": status,
                        "notes": e.get("notes"),
                        "check_in_time": e.get("check_in_time"),
                        "check_out_time": e.get("check_out_time"),
                        "updated_at": now_iso,
                    }
                    await db.attendance.update_one(
                        {"teacher_id": teacher_id, "student_id": matched["id"], "date": date_s},
                        {"$set": doc, "$setOnInsert": {"created_at": now_iso, "id": f"att_{uuid.uuid4().hex[:12]}"}},
                        upsert=True,
                    )
                    entries_out.append({
                        "student_id": matched["id"],
                        "student_name": f"{matched['first_name']} {matched['last_name']}",
                        "status": status,
                    })
                results.append({"action": action, "ok": True, "saved": entries_out, "unknown_students": unknown, "date": date_s})

            elif action == "mark_all_present":
                date_s = args.get("date") or today
                now_iso = datetime.now(timezone.utc).isoformat()
                count = 0
                for s in students:
                    doc = {
                        "teacher_id": teacher_id,
                        "student_id": s["id"],
                        "date": date_s,
                        "status": "Geldi",
                        "notes": None,
                        "check_in_time": None,
                        "check_out_time": None,
                        "updated_at": now_iso,
                    }
                    await db.attendance.update_one(
                        {"teacher_id": teacher_id, "student_id": s["id"], "date": date_s},
                        {"$set": doc, "$setOnInsert": {"created_at": now_iso, "id": f"att_{uuid.uuid4().hex[:12]}"}},
                        upsert=True,
                    )
                    count += 1
                results.append({"action": action, "ok": True, "count": count, "date": date_s})

            elif action == "add_daily_case":
                now = datetime.now(timezone.utc)
                student_name = args.get("student_name")
                matched = _find_student_by_name(students, student_name) if student_name else None
                doc = {
                    "id": f"case_{uuid.uuid4().hex[:12]}",
                    "teacher_id": teacher_id,
                    "student_id": matched["id"] if matched else None,
                    "student_name": (f"{matched['first_name']} {matched['last_name']}" if matched else student_name),
                    "title": args.get("title") or "Günlük Vaka",
                    "description": args.get("description"),
                    "date": args.get("date") or now.date().isoformat(),
                    "created_at": now.isoformat(),
                    "updated_at": now.isoformat(),
                }
                await db.daily_cases.insert_one(doc.copy())
                doc.pop("_id", None)
                results.append({"action": action, "ok": True, "case": doc})

            elif action == "add_activity_note":
                now = datetime.now(timezone.utc)
                doc = {
                    "id": f"act_{uuid.uuid4().hex[:12]}",
                    "teacher_id": teacher_id,
                    "activity_name": args.get("activity_name") or "Etkinlik",
                    "description": args.get("description"),
                    "date": args.get("date") or now.date().isoformat(),
                    "participants": args.get("participants") or [],
                    "created_at": now.isoformat(),
                    "updated_at": now.isoformat(),
                }
                await db.activity_notes.insert_one(doc.copy())
                doc.pop("_id", None)
                results.append({"action": action, "ok": True, "note": doc})
            else:
                results.append({"action": action, "ok": False, "error": "unknown_action"})
        except Exception as e:
            results.append({"action": action, "ok": False, "error": str(e)})
    return results


def _parse_llm_json(text: str) -> dict:
    """Robustly extract JSON object from LLM response."""
    if not text:
        return {"reply": "", "commands": []}
    t = text.strip()
    # Strip code fences if present
    if t.startswith("```"):
        t = t.strip("`")
        if t.startswith("json"):
            t = t[4:]
        t = t.strip()
        # take until last triple-backtick if any remaining
    # Try direct
    try:
        data = json.loads(t)
    except Exception:
        # Extract outermost JSON object
        start = t.find("{")
        end = t.rfind("}")
        if start >= 0 and end > start:
            try:
                data = json.loads(t[start:end + 1])
            except Exception:
                data = {"reply": t[:200], "commands": []}
        else:
            data = {"reply": t[:200], "commands": []}
    if not isinstance(data, dict):
        return {"reply": "", "commands": []}
    data.setdefault("reply", "")
    data.setdefault("commands", [])
    if not isinstance(data["commands"], list):
        data["commands"] = []
    return data


async def _run_assistant(user: dict, text: str) -> dict:
    teacher_id = user["user_id"]
    # Load prior messages (last 20) for multi-turn context
    prior = await db.chat_messages.find(
        {"teacher_id": teacher_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(20)
    prior.reverse()

    ctx = await _build_context(user)
    system = SYSTEM_PROMPT + "\n\nSİSTEM BAĞLAMI:\n" + ctx

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"asistan-{teacher_id}",
        system_message=system,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    # Re-inject prior turns so Claude has memory of the conversation
    for m in prior:
        # Replay user turns only — assistant will regenerate its own reasoning
        if m.get("role") == "user":
            try:
                await chat.send_message(UserMessage(text=m["content"]))
            except Exception:
                pass

    now_iso = datetime.now(timezone.utc).isoformat()
    # Save user message
    await db.chat_messages.insert_one({
        "id": f"msg_{uuid.uuid4().hex[:12]}",
        "teacher_id": teacher_id,
        "role": "user",
        "content": text,
        "created_at": now_iso,
    })

    try:
        raw = await chat.send_message(UserMessage(text=text))
    except Exception as exc:
        logging.getLogger(__name__).exception("LLM error")
        msg = str(exc)
        if "budget" in msg.lower() or "Budget" in msg:
            friendly = "Universal Key bakiyeniz tükendi. Profil → Universal Key → Bakiye Ekle bölümünden yükleme yapın."
        else:
            friendly = "Şu an bağlanamadım. Biraz sonra tekrar deneyin."
        raw = json.dumps({"reply": friendly, "commands": []})

    data = _parse_llm_json(raw if isinstance(raw, str) else str(raw))
    reply_text = data.get("reply") or ""
    commands = data.get("commands") or []

    executed = await _execute_commands(teacher_id, commands)

    # Save assistant message
    await db.chat_messages.insert_one({
        "id": f"msg_{uuid.uuid4().hex[:12]}",
        "teacher_id": teacher_id,
        "role": "assistant",
        "content": reply_text,
        "executed": executed,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    return {"reply": reply_text, "executed": executed}


@api_router.post("/chat/message")
async def chat_message(body: ChatRequest, user: dict = Depends(get_current_user)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=503, detail="LLM key yapılandırılmamış")
    text = (body.message or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Boş mesaj")
    return await _run_assistant(user, text)


@api_router.post("/chat/voice")
async def chat_voice(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=503, detail="LLM key yapılandırılmamış")
    content = await file.read()
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Ses dosyası 25MB'dan büyük")
    # Save to temp file (Whisper needs a filename with extension)
    suffix = ".webm"
    if file.filename and "." in file.filename:
        suffix = "." + file.filename.rsplit(".", 1)[-1].lower()
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(content)
        tmp_path = tmp.name
    try:
        stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
        with open(tmp_path, "rb") as af:
            resp = await stt.transcribe(file=af, model="whisper-1", response_format="json", language="tr")
        transcript = getattr(resp, "text", "") or ""
    finally:
        try:
            os.remove(tmp_path)
        except Exception:
            pass

    transcript = (transcript or "").strip()
    if not transcript:
        return {"transcript": "", "reply": "Sesi anlayamadım, tekrar eder misiniz?", "executed": []}
    result = await _run_assistant(user, transcript)
    return {"transcript": transcript, **result}


@api_router.get("/chat/history")
async def chat_history(user: dict = Depends(get_current_user)):
    docs = await db.chat_messages.find(
        {"teacher_id": user["user_id"]}, {"_id": 0}
    ).sort("created_at", 1).to_list(500)
    return docs


@api_router.delete("/chat/history")
async def chat_clear(user: dict = Depends(get_current_user)):
    await db.chat_messages.delete_many({"teacher_id": user["user_id"]})
    return {"ok": True}


# Include router (MUST be after all @api_router decorators)
app.include_router(api_router)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
