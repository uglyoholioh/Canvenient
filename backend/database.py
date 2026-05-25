import os

import certifi
from dotenv import load_dotenv
from databases import Database

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL is not set in .env")

db = Database(DATABASE_URL, min_size=1, max_size=3)

