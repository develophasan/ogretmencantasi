import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import google.generativeai as genai

async def test_mongo():
    print("Testing MongoDB Atlas connection...")
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    try:
        client = AsyncIOMotorClient(mongo_url)
        db = client[db_name]
        # Basic ping/command
        await db.command("ping")
        print("✅ MongoDB connection successful!")
        return True
    except Exception as e:
        print(f"❌ MongoDB connection failed: {e}")
        return False

async def test_gemini():
    print("Testing Gemini API connection...")
    gemini_key = os.environ.get("GEMINI_API_KEY")
    if not gemini_key:
        print("❌ GEMINI_API_KEY not found in .env")
        return False
    try:
        genai.configure(api_key=gemini_key)
        print("Available models:")
        for m in genai.list_models():
            if 'generateContent' in m.supported_generation_methods:
                print(f" - {m.name}")
        
        # Try a more conservative model name if flash fails
        model_name = "gemini-flash-latest" 
        print(f"Trying with model: {model_name}")
        model = genai.GenerativeModel(model_name)
        response = model.generate_content("Hello")
        print(f"✅ Gemini API response: {response.text[:50]}...")
        return True
    except Exception as e:
        print(f"❌ Gemini API failed: {e}")
        return False

async def main():
    load_dotenv()
    mongo_ok = await test_mongo()
    gemini_ok = await test_gemini()
    
    if mongo_ok and gemini_ok:
        print("\n🚀 All systems ready!")
    else:
        print("\n⚠️ Some systems failed verification.")

if __name__ == "__main__":
    asyncio.run(main())
