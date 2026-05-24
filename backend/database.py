import os

import certifi
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

MONGO_URL = os.getenv("MONGODB_URL")
if not MONGO_URL:
    raise ValueError("MONGODB_URL is not set in .env")

client = AsyncIOMotorClient(MONGO_URL, tlsCAFile=certifi.where())
db = client.canvenient
