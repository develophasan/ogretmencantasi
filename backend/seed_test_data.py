import asyncio
import os
import uuid
from datetime import datetime, timedelta, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

async def seed_data():
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    phone = "5555555555"

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    print(f"Seeding data for {phone}...")

    # 1. Ensure Teacher Exists
    user = await db.users.find_one({"phone": phone})
    user_id = ""
    if not user:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "phone": phone,
            "name": "Test Öğretmen",
            "school_name": "Örnek Anaokulu",
            "role": "teacher",
            "is_approved": True,
            "setup_completed": True,
            "created_at": (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
        })
    else:
        user_id = user["user_id"]

    # 2. Add 10 Students
    student_ids = []
    names = ["Ali", "Ayşe", "Mehmet", "Fatma", "Can", "Elif", "Burak", "Zeynep", "Mert", "Selin"]
    last_names = ["Yılmaz", "Kaya", "Demir", "Çelik", "Şahin", "Öztürk", "Aydın", "Yıldız", "Arslan", "Doğan"]
    
    # Clear existing students for this teacher to avoid clutter
    await db.students.delete_many({"teacher_id": user_id})
    
    for i in range(10):
        s_id = f"std_{uuid.uuid4().hex[:12]}"
        student_ids.append(s_id)
        await db.students.insert_one({
            "id": s_id,
            "teacher_id": user_id,
            "first_name": names[i],
            "last_name": last_names[i],
            "birth_date": "2019-05-15",
            "gender": "Kız" if i % 2 == 0 else "Erkek",
            "status": "Aktif",
            "enrollment_date": (datetime.now(timezone.utc) - timedelta(days=60)).date().isoformat(),
            "created_at": (datetime.now(timezone.utc) - timedelta(days=60)).isoformat(),
            "updated_at": (datetime.now(timezone.utc) - timedelta(days=60)).isoformat(),
        })

    # 3. Add Attendance
    for d in range(1, 4): # Last 3 days
        date_str = (datetime.now(timezone.utc) - timedelta(days=d)).date().isoformat()
        for s_id in student_ids[:5]: # Only some students
            await db.attendance.insert_one({
                "id": f"att_{uuid.uuid4().hex[:12]}",
                "teacher_id": user_id,
                "student_id": s_id,
                "date": date_str,
                "status": "Geldi" if s_id != student_ids[0] else "İzinli",
                "updated_at": (datetime.now(timezone.utc) - timedelta(days=d, hours=2)).isoformat()
            })

    # 4. Add Daily Cases
    cases = [
        ("Öğle Yemeği", "Yemeğini bitirmekte zorlandı ama arkadaşlarıyla paylaştı.", 1),
        ("Bahçe Etkinliği", "Koşarken düştü, ufak bir sıyrık oldu. Pansuman yapıldı.", 2),
    ]
    for title, desc, day in cases:
        await db.daily_cases.insert_one({
            "id": f"case_{uuid.uuid4().hex[:12]}",
            "teacher_id": user_id,
            "student_id": student_ids[0],
            "student_name": f"{names[0]} {last_names[0]}",
            "title": title,
            "description": desc,
            "date": (datetime.now(timezone.utc) - timedelta(days=day)).date().isoformat()
        })

    # 5. Add AI Chats
    chats = [
        ("Sınıfım için 3 adet yaratıcı drama oyunu önerir misin?", "Tabii! İşte 3 drama oyunu: 1. Sihirli Torba...", 5),
        ("Bir öğrencim arkadaşlarına vuruyor, nasıl yaklaşmalıyım?", "Bu durum sabır gerektirir. Öncelikle duygularını ifade etmesine yardımcı olun...", 2),
    ]
    for q, a, hour in chats:
        ts = (datetime.now(timezone.utc) - timedelta(hours=hour))
        await db.chat_messages.insert_one({
            "id": f"msg_{uuid.uuid4().hex[:12]}",
            "teacher_id": user_id,
            "role": "user",
            "content": q,
            "timestamp": ts.isoformat()
        })
        await db.chat_messages.insert_one({
            "id": f"msg_{uuid.uuid4().hex[:12]}",
            "teacher_id": user_id,
            "role": "assistant",
            "content": a,
            "timestamp": (ts + timedelta(minutes=1)).isoformat()
        })
        # 6. Add AI Usage for these chats
        await db.ai_usage.insert_one({
            "user_id": user_id,
            "model": "gemini-1.5-flash",
            "prompt_tokens": len(q),
            "response_tokens": len(a),
            "features": "chat",
            "timestamp": ts.isoformat()
        })

    print("Data seeded successfully!")
    client.close()

if __name__ == "__main__":
    asyncio.run(seed_data())
