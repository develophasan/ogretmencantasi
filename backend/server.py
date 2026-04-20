from fastapi import FastAPI, APIRouter, Request, Response, HTTPException, Depends, Query
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone, timedelta, date
import httpx


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
    }


# Include router
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
