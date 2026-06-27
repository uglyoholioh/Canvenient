import asyncio
import os
import sys

# Ensure backend directory is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import db

async def test():
    print("Connecting to DB...")
    await db.connect()
    try:
        print("Querying tasks...")
        rows = await db.fetch_all("""
            SELECT t.id, t.title FROM tasks t LIMIT 1
        """)
        print("Success! Tasks queried count:", len(rows))
    except Exception as e:
        print("Error encountered:", str(e))
    finally:
        await db.disconnect()

if __name__ == "__main__":
    asyncio.run(test())
