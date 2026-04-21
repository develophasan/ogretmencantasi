from fastapi import FastAPI, APIRouter, Request, Response, HTTPException, Depends, Query, UploadFile, File, BackgroundTasks
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import ssl
import socket
try:
    import certifi
    ca = certifi.where()
except ImportError:
    ca = None
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
import google.generativeai as genai


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
db_name = os.environ['DB_NAME']

# Build a robust SSL context forcing TLS 1.2 or higher
ssl_context = ssl.create_default_context(cafile=ca)
ssl_context.check_hostname = False
ssl_context.verify_mode = ssl.CERT_NONE  # For initial troubleshooting
try:
    # Explicitly force TLS 1.2+
    ssl_context.minimum_version = ssl.TLSVersion.TLSv1_2
except AttributeError:
    # Fallback for older python versions
    ssl_context.options |= ssl.OP_NO_SSLv2 | ssl.OP_NO_SSLv3 | ssl.OP_NO_TLSv1 | ssl.OP_NO_TLSv1_1

client_kwargs = {
    "tls": True,
    "tlsContext": ssl_context,
    "tlsAllowInvalidCertificates": True,
    "serverSelectionTimeoutMS": 5000,
    "connectTimeoutMS": 5000,
}

# Ensure common parameters are present
if "retryWrites" not in mongo_url:
    sep = "&" if "?" in mongo_url else "?"
    mongo_url += f"{sep}retryWrites=true&w=majority"

client = AsyncIOMotorClient(mongo_url, **client_kwargs)
db = client[db_name]

class TelegramClient:
    def __init__(self):
        self.token = os.environ.get("TELEGRAM_BOT_TOKEN")
        self.base_url = f"https://api.telegram.org/bot{self.token}"

    async def send_message(self, chat_id: int, text: str, reply_markup: dict = None):
        if not self.token:
            return False
        url = f"{self.base_url}/sendMessage"
        payload = {"chat_id": chat_id, "text": text}
        if reply_markup:
            payload["reply_markup"] = reply_markup
        
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.post(url, json=payload)
                return resp.status_code == 200
            except:
                return False

    async def get_file_path(self, file_id: str):
        url = f"{self.base_url}/getFile"
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, params={"file_id": file_id})
            if resp.status_code == 200:
                return resp.json().get("result", {}).get("file_path")
        return None

    async def download_file(self, file_path: str):
        url = f"https://api.telegram.org/file/bot{self.token}/{file_path}"
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.get(url)
                if resp.status_code == 200:
                    ext = Path(file_path).suffix or ".oga"
                    temp_fd, temp_path = tempfile.mkstemp(suffix=ext)
                    with os.fdopen(temp_fd, "wb") as f:
                        f.write(resp.content)
                    return temp_path
            except Exception as e:
                print(f"Error downloading file: {e}")
                return None
        return None

    async def set_webhook(self, webhook_url: str, secret_token: str = None):
        if not self.token:
            return False, "Bot token missing"
        
        url = f"{self.base_url}/setWebhook"
        params = {"url": webhook_url}
        if secret_token:
            params["secret_token"] = secret_token
            
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json=params)
            data = resp.json()
            return data.get("ok", False), data.get("description", "Unknown error")

telegram_client = TelegramClient()

app = FastAPI(title="Okul Öncesi Eğitim Yönetim Sistemi")

@app.on_event("startup")
async def startup_db_client():
    # Create unique index for phone numbers
    try:
        await db.users.create_index("phone", unique=True)
        await db.registration_requests.create_index("phone", unique=True)
        print("Database indices verified.")
    except Exception as e:
        print(f"Error creating indices: {e}")

@app.get("/api/health")
async def health_check():
    health = {
        "status": "ok",
        "time": datetime.now(timezone.utc).isoformat(),
        "network": "unknown",
        "db": "disconnected"
    }
    
    # 1. Test Network Connectivity (DNS/Socket)
    try:
        # Check if we can resolve the specific shard address from the error logs
        socket.gethostbyname("ac-dlt1o7v-shard-00-00.jjfg2ay.mongodb.net")
        health["network"] = "reachable"
    except Exception as e:
        health["network"] = f"unreachable: {str(e)}"

    # 2. Test DB Connection
    try:
        await db.command("ping")
        health["db"] = "connected"
    except Exception as e:
        health["db"] = f"error: {str(e)}"
        return JSONResponse(status_code=500, content=health)
    
    return health

api_router = APIRouter(prefix="/api")

EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

generation_config = {
    "temperature": 0.7,
    "top_p": 0.95,
    "top_k": 64,
    "max_output_tokens": 8192,
    "response_mime_type": "text/plain",
}

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


class PhoneLoginRequest(BaseModel):
    phone: str


class ReportDraftRequest(BaseModel):
    student_id: str
    start_date: str
    end_date: str


class RegistrationRequestCreate(BaseModel):
    name: str
    school_name: str
    email: EmailStr
    phone: str


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
    
    if not user.get("is_approved", False) and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Hesabınız henüz onaylanmadı. Lütfen yönetici onayını bekleyin.")
        
    return user


async def get_admin_user(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok.")
    return user


async def log_ai_usage(user_id: str, model: str, prompt_tokens: int = 0, response_tokens: int = 0, features: str = ""):
    usage_doc = {
        "user_id": user_id,
        "model": model,
        "prompt_tokens": prompt_tokens,
        "response_tokens": response_tokens,
        "features": features,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    await db.ai_usage.insert_one(usage_doc)


# ============================================================
# AUTH ROUTES
# ============================================================

@api_router.post("/auth/phone-login")
async def phone_login(body: PhoneLoginRequest, response: Response):
    """Simple login with phone number (No OTP for now)."""
    print(f"DEBUG: Login attempt for phone: {body.phone}")
    phone = body.phone.strip()
    if not phone:
        raise HTTPException(status_code=400, detail="Telefon numarası gereklidir")

    # Check if this is the bootstrap Admin
    admin_phone = os.environ.get("ADMIN_PHONE")
    is_bootstrap_admin = admin_phone and phone == admin_phone.strip()

    existing = await db.users.find_one({"phone": phone}, {"_id": 0})
    
    if not existing and not is_bootstrap_admin:
        # Check if there is a pending registration request
        pending = await db.registration_requests.find_one({"phone": phone, "status": "pending"})
        if pending:
            raise HTTPException(status_code=403, detail="Kayıt talebiniz beklemede. Lütfen onaylanmasını bekleyin.")
        raise HTTPException(status_code=404, detail="Kayıtlı kullanıcı bulunamadı. Lütfen kayıt talebi oluşturun.")

    if not existing and is_bootstrap_admin:
        # Bootstrap the admin user
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        existing = {
            "user_id": user_id,
            "phone": phone,
            "name": "Sistem Yöneticisi",
            "role": "admin",
            "is_approved": True,
            "setup_completed": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(existing.copy())
    elif is_bootstrap_admin:
        # Ensure existing admin is promoted
        await db.users.update_one(
            {"phone": phone},
            {"$set": {"role": "admin", "is_approved": True}}
        )
        existing["role"] = "admin"
        existing["is_approved"] = True

    if not existing.get("is_approved", False) and existing.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Hesabınız henüz onaylanmadı. Lütfen yönetici onayını bekleyin.")

    user_id = existing["user_id"]

    # Store session
    session_token = f"sess_{uuid.uuid4().hex}"
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    # Use a secure but local-dev friendly cookie configuration
    # Note: samesite="none" requires secure=True, which usually requires HTTPS.
    # For local development, samesite="lax" and secure=False is better.
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=7 * 24 * 60 * 60,
        path="/",
    )
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    user = _serialize_user(user)
    return {"user": user}


@api_router.get("/auth/me")
async def auth_me(user: dict = Depends(get_current_user)):
    return _serialize_user(user)


@api_router.post("/auth/register-request")
async def register_request(body: RegistrationRequestCreate):
    phone = body.phone.strip()
    # Check if already a user
    existing = await db.users.find_one({"phone": phone})
    if existing:
        raise HTTPException(status_code=400, detail="Bu numara zaten kayıtlı. Lütfen giriş yapın.")
    
    # Check if already a pending request
    pending = await db.registration_requests.find_one({"phone": phone, "status": "pending"})
    if pending:
        raise HTTPException(status_code=400, detail="Zaten bekleyen bir kayıt talebiniz var.")
    
    request_doc = {
        "id": f"req_{uuid.uuid4().hex[:12]}",
        "name": body.name,
        "school_name": body.school_name,
        "email": body.email,
        "phone": phone,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.registration_requests.insert_one(request_doc)
    return {"message": "Kayıt talebiniz başarıyla alındı. Onaylandığında giriş yapabileceksiniz."}


# ============================================================
# ADMIN ROUTES
# ============================================================

@api_router.get("/admin/dashboard", dependencies=[Depends(get_admin_user)])
async def admin_dashboard():
    total_teachers = await db.users.count_documents({"role": {"$ne": "admin"}})
    total_approved = await db.users.count_documents({"role": {"$ne": "admin"}, "is_approved": True})
    pending_requests = await db.registration_requests.count_documents({"status": "pending"})
    total_students = await db.students.count_documents({})
    
    # Simple AI usage aggregation (last 30 days)
    # In a real app, use MongoDB aggregation pipelines
    ai_calls = await db.ai_usage.count_documents({})
    
    return {
        "total_teachers": total_teachers,
        "total_approved": total_approved,
        "pending_requests": pending_requests,
        "total_students": total_students,
        "ai_calls": ai_calls
    }

@api_router.get("/admin/requests", dependencies=[Depends(get_admin_user)])
async def admin_get_requests():
    requests = await db.registration_requests.find({"status": "pending"}).sort("created_at", -1).to_list(100)
    for r in requests:
        r["_id"] = str(r["_id"])
    return requests

@api_router.post("/admin/requests/{req_id}/approve", dependencies=[Depends(get_admin_user)])
async def admin_approve_request(req_id: str):
    req = await db.registration_requests.find_one({"id": req_id})
    if not req:
        raise HTTPException(status_code=404, detail="Talep bulunamadı.")
    
    if req["status"] != "pending":
        raise HTTPException(status_code=400, detail="Talep zaten işlenmiş.")
    
    # Create user
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    new_user = {
        "user_id": user_id,
        "phone": req["phone"],
        "email": req["email"],
        "name": req["name"],
        "school_name": req["school_name"],
        "role": "teacher",
        "is_approved": True,
        "setup_completed": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "class_schedule": {
            "class_type": None,
            "shift": None,
            "arrival_time": None,
            "departure_time": None,
            "breakfast_time": None,
            "lunch_time": None,
            "afternoon_snack_time": None,
        }
    }
    await db.users.insert_one(new_user)
    await db.registration_requests.update_one({"id": req_id}, {"$set": {"status": "approved"}})
    return {"message": "Kayıt onaylandı ve kullanıcı oluşturuldu."}

@api_router.post("/admin/requests/{req_id}/reject", dependencies=[Depends(get_admin_user)])
async def admin_reject_request(req_id: str):
    await db.registration_requests.update_one({"id": req_id}, {"$set": {"status": "rejected"}})
    return {"message": "Talep reddedildi."}

@api_router.get("/admin/teachers", dependencies=[Depends(get_admin_user)])
async def admin_get_teachers():
    teachers = await db.users.find({"role": {"$ne": "admin"}}).to_list(100)
    for t in teachers:
        t["_id"] = str(t["_id"])
        # Add student count
        t["student_count"] = await db.students.count_documents({"teacher_id": t["user_id"]})
        # Add AI usage count
        t["ai_usage_count"] = await db.ai_usage.count_documents({"user_id": t["user_id"]})
    return teachers


# --- NEW LOGGING ENDPOINTS ---

@api_router.get("/admin/logs/chat", dependencies=[Depends(get_admin_user)])
async def admin_get_chat_logs():
    messages = await db.chat_messages.find().sort("timestamp", -1).limit(200).to_list(200)
    # Resolve teacher names
    teacher_cache = {}
    for msg in messages:
        msg["_id"] = str(msg["_id"])
        t_id = msg.get("teacher_id")
        if t_id not in teacher_cache:
            t = await db.users.find_one({"user_id": t_id}, {"name": 1})
            teacher_cache[t_id] = t["name"] if t else "Bilinmeyen"
        msg["teacher_name"] = teacher_cache[t_id]
    return messages

@api_router.get("/admin/logs/activities", dependencies=[Depends(get_admin_user)])
async def admin_get_activities():
    # Unified feed: attendance, cases, notes
    attendance = await db.attendance.find().sort("updated_at", -1).limit(50).to_list(50)
    cases = await db.daily_cases.find().sort("date", -1).limit(50).to_list(50)
    notes = await db.activity_notes.find().sort("created_at", -1).limit(50).to_list(50)
    
    feed = []
    # Normalize formats
    teacher_cache = {}
    async def get_t_name(t_id):
        if t_id not in teacher_cache:
            t = await db.users.find_one({"user_id": t_id}, {"name": 1})
            teacher_cache[t_id] = t["name"] if t else "Bilinmeyen"
        return teacher_cache[t_id]

    for a in attendance:
        feed.append({
            "id": str(a["_id"]),
            "type": "attendance",
            "teacher_name": await get_t_name(a["teacher_id"]),
            "details": f"Yoklama alındı: {a.get('status')}",
            "timestamp": a.get("updated_at")
        })
    for c in cases:
        feed.append({
            "id": str(c["_id"]),
            "type": "case",
            "teacher_name": await get_t_name(c["teacher_id"]),
            "details": f"Vaka eklendi: {c.get('title')}",
            "timestamp": c.get("date")
        })
    for n in notes:
        feed.append({
            "id": str(n["_id"]),
            "type": "note",
            "teacher_name": await get_t_name(n["teacher_id"]),
            "details": f"Etkinlik notu eklendi",
            "timestamp": n.get("created_at")
        })
    
    # Sort and return latest 100
    feed.sort(key=lambda x: x["timestamp"], reverse=True)
    return feed[:100]

@api_router.get("/admin/logs/ai", dependencies=[Depends(get_admin_user)])
async def admin_get_ai_logs():
    logs = await db.ai_usage.find().sort("timestamp", -1).limit(200).to_list(200)
    teacher_cache = {}
    for log in logs:
        log["_id"] = str(log["_id"])
        t_id = log.get("user_id")
        if t_id not in teacher_cache:
            t = await db.users.find_one({"user_id": t_id}, {"name": 1})
            teacher_cache[t_id] = t["name"] if t else "Bilinmeyen"
        log["teacher_name"] = teacher_cache[t_id]
    return logs


@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    session_token = request.cookies.get("session_token")
    if not session_token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            session_token = auth_header[7:]
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    response.delete_cookie("session_token", path="/", samesite="lax", secure=False)
    return {"ok": True}


def _serialize_user(user: dict) -> dict:
    out = {
        "user_id": user["user_id"],
        "phone": user.get("phone"),
        "email": user.get("email"),
        "name": user.get("name"),
        "picture": user.get("picture"),
        "school_name": user.get("school_name"),
        "education_model": user.get("education_model"),
        "class_schedule": user.get("class_schedule") or {},
        "setup_completed": user.get("setup_completed", False),
        "role": user.get("role", "teacher"),
        "is_approved": user.get("is_approved", False),
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

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
if GEMINI_API_KEY:
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        model_to_use = "gemini-3-flash-preview"
        shared_model = genai.GenerativeModel(
            model_name=model_to_use,
            generation_config=generation_config,
        )
    except Exception as e:
        shared_model = None
else:
    shared_model = None

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
    # Load prior messages (last 10) to provide short conversation memory via system prompt
    prior = await db.chat_messages.find(
        {"teacher_id": teacher_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(20)
    prior.reverse()

    ctx = await _build_context(user)
    history_text = ""
    if prior:
        lines = []
        for m in prior:
            role = "Öğretmen" if m.get("role") == "user" else "Asistan"
            content = (m.get("content") or "").strip().replace("\n", " ")
            if len(content) > 180:
                content = content[:180] + "…"
            lines.append(f"{role}: {content}")
        history_text = "\n\nSON KONUŞMA ÖZETİ:\n" + "\n".join(lines)

    system = SYSTEM_PROMPT + "\n\nSİSTEM BAĞLAMI:\n" + ctx + history_text
    
    if not shared_model:
         raise Exception("Gemini API key not configured")

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
        # Using generate_content for better stability
        response = await shared_model.generate_content_async(system + "\n\nUSER: " + text)
        raw = response.text

        # Log AI Usage
        await log_ai_usage(
            user_id=teacher_id,
            model="gemini-1.5-flash",
            prompt_tokens=len(text),
            response_tokens=len(raw),
            features="chat"
        )
    except Exception as exc:
        err_str = str(exc)
        logging.getLogger(__name__).exception("LLM error")
        if "429" in err_str or "quota" in err_str.lower():
            friendly = f"Gemini Kotası: {err_str[:100]}"
        else:
            friendly = f"Gemini Hatası: {err_str[:150]}"
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
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="Gemini API key yapılandırılmamış")
    text = (body.message or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Boş mesaj")
    return await _run_assistant(user, text)


@api_router.post("/chat/voice")
async def chat_voice(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    transcript = ""
    transcribe_error = "Sesle komut özelliği şu an devre dışıdır. Lütfen metin yazarak asistanı kullanın."
    try:
        # Placeholder for future Gemini native audio support
        pass
    except Exception as exc:
        logging.getLogger(__name__).exception("Transcription error")
        transcribe_error = str(exc)
    if transcribe_error:
        msg = transcribe_error.lower()
        if "budget" in msg:
            friendly = "Universal Key bakiyeniz tükendi. Profil → Universal Key → Bakiye Ekle bölümünden yükleme yapın."
        else:
            friendly = "Sesi işleyemedim, tekrar dener misiniz?"
        return {"transcript": "", "reply": friendly, "executed": []}

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




# In-memory cache for processed telegram updates
processed_updates = set()

async def process_telegram_ai(chat_id: int, user: dict, chat_text: str, source: str):
    try:
        # Run assistant
        result = await _run_assistant(user, chat_text)
        ai_content = result.get("reply") or "Cevap üretilemedi."

        # Log AI Usage
        await log_ai_usage(user["user_id"], "gemini-1.5-flash", len(chat_text), len(ai_content), f"{source}_chat")

        # Send response back to Telegram
        await telegram_client.send_message(chat_id, ai_content)
    except Exception as e:
        err_msg = str(e)
        logging.getLogger(__name__).error(f"Telegram Background AI Error: {err_msg}")
        await telegram_client.send_message(chat_id, f"Bağlantı hatası: {err_msg[:100]}...")

@api_router.post("/telegram/webhook")
async def telegram_webhook(request: Request, background_tasks: BackgroundTasks):
    # Optional: Verify secret token
    secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token")
    expected = os.environ.get("TELEGRAM_SECRET_TOKEN")
    if expected and secret != expected:
        return Response(status_code=403)

    try:
        data = await request.json()
    except:
        return {"ok": True}

    # Deduplication
    update_id = data.get("update_id")
    if update_id in processed_updates:
        return {"ok": True}
    if update_id:
        processed_updates.add(update_id)
        # Keep only last 100
        if len(processed_updates) > 100:
            processed_updates.pop()

    message = data.get("message")
    if not message:
        return {"ok": True}

    chat_id = message["chat"]["id"]
    text = message.get("text")
    voice = message.get("voice")
    contact = message.get("contact")

    # 1. Identity Mapping
    user = await db.users.find_one({"telegram_chat_id": chat_id})
    
    if contact:
        phone = contact.get("phone_number", "").replace("+", "")
        clean_phone = phone.replace("90", "", 1) if phone.startswith("90") else phone
        if len(clean_phone) > 10: clean_phone = clean_phone[-10:]
        target_user = await db.users.find_one({"phone": clean_phone})
        if target_user:
            await db.users.update_one({"user_id": target_user["user_id"]}, {"$set": {"telegram_chat_id": chat_id}})
            await telegram_client.send_message(chat_id, f"Teşekkürler {target_user['name']}! Hesabınız bağlandı.")
        return {"ok": True}

    if not user:
        if contact:
            phone = contact.get("phone_number", "").replace("+", "")
            # Normalize phone (remove 90 if exists, take last 10 digits)
            clean_phone = phone.replace("90", "", 1) if phone.startswith("90") else phone
            if len(clean_phone) > 10: clean_phone = clean_phone[-10:]
            
            target_user = await db.users.find_one({"phone": clean_phone})
            if target_user:
                await db.users.update_one({"user_id": target_user["user_id"]}, {"$set": {"telegram_chat_id": chat_id}})
                await telegram_client.send_message(chat_id, f"Güvenlik doğrulaması başarılı! Harika {target_user['name']}, hesabınız güvenli bir şekilde bağlandı.")
            else:
                await telegram_client.send_message(chat_id, "Üzgünüm, bu telefon numarası sisteme kayıtlı değil. Lütfen okul yönetiminden kaydınızı kontrol edin.")
            return {"ok": True}

        # If not sharing contact yet
        markup = {
            "keyboard": [[{"text": "📱 Numaramı Paylaş ve Doğrula", "request_contact": True}]],
            "resize_keyboard": True,
            "one_time_keyboard": True
        }
        await telegram_client.send_message(chat_id, "Merhaba! Güvenliğiniz için lütfen aşağıdaki butona tıklayarak Telegram'da kayıtlı numaranızı paylaşın.", reply_markup=markup)
        return {"ok": True}

    # 4. Process Message (Async Background Task)
    async def async_logic():
        chat_text = text or ""
        if voice:
            file_path = await telegram_client.get_file_path(voice["file_id"])
            if file_path:
                media_path = await telegram_client.download_file(file_path)
                if media_path:
                    try:
                        audio_file = genai.upload_file(path=media_path)
                        prompt = "Bu sesli mesajı yazıya dök (STT). Sadece transkripti ver."
                        response = shared_model.generate_content([prompt, audio_file])
                        chat_text = response.text
                        os.remove(media_path)
                    except Exception as e:
                        await telegram_client.send_message(chat_id, f"Ses hatası: {str(e)}")
                        return

        if not chat_text:
            return

        # Log user message
        await db.chat_messages.insert_one({
            "id": f"msg_{uuid.uuid4().hex[:12]}",
            "teacher_id": user["user_id"],
            "role": "user",
            "content": chat_text,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": "telegram"
        })

        await process_telegram_ai(chat_id, user, chat_text, "telegram")

    background_tasks.add_task(async_logic)
    return {"ok": True}


@api_router.get("/telegram/setup")
async def telegram_setup():
    base_url = os.environ.get("REACT_APP_API_URL")
    if not base_url:
        return {"ok": False, "error": "REACT_APP_API_URL environment variable is missing."}
    
    webhook_url = f"{base_url}/api/telegram/webhook"
    secret = os.environ.get("TELEGRAM_SECRET_TOKEN")
    
    ok, description = await telegram_client.set_webhook(webhook_url, secret)
    if ok:
        return {"ok": True, "message": f"Webhook successfully set to {webhook_url}", "description": description}
    else:
        return {"ok": False, "error": description}


# Include router (MUST be after all @api_router decorators)
app.include_router(api_router)

# CORS
cors_origins = os.environ.get('CORS_ORIGINS', '*').split(',')
# Add common production and dev origins if not present
extra_origins = [
    "https://delightful-wholeness-production-a765.up.railway.app",
    "https://ogretmencantasi-production.up.railway.app"
]
for origin in extra_origins:
    if origin not in cors_origins:
        cors_origins.append(origin)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=cors_origins,
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
