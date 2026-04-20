import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

# Load env vars
load_dotenv()

async def cleanup_database():
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    admin_phone = os.environ.get("ADMIN_PHONE")

    print(f"Connecting to MongoDB: {db_name}...")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    # 1. Clear all collections except users
    collections_to_drop = [
        "students", 
        "attendance", 
        "daily_cases", 
        "registration_requests", 
        "ai_usage", 
        "chat_messages", 
        "user_sessions",
        "activity_notes"
    ]

    for coll_name in collections_to_drop:
        count = await db[coll_name].count_documents({})
        if count > 0:
            await db[coll_name].delete_many({})
            print(f" - {coll_name} temizlendi ({count} kayıt silindi).")
        else:
            print(f" - {coll_name} zaten boş.")

    # 2. Clear users except Admin
    if admin_phone:
        query = {"phone": {"$ne": admin_phone}}
        count = await db.users.count_documents(query)
        if count > 0:
            await db.users.delete_many(query)
            print(f" - users temizlendi ({count} öğretmen hesabı silindi, Admin korundu).")
        else:
            print(" - users zaten boş (veya sadece Admin var).")
    else:
        print(" ! UYARI: ADMIN_PHONE tanımlı değil, tüm kullanıcılar silinecek.")
        await db.users.delete_many({})

    print("\nVeritabanı sıfırlandı. Testlere temiz bir sayfa ile başlayabilirsiniz!")
    client.close()

if __name__ == "__main__":
    asyncio.run(cleanup_database())
