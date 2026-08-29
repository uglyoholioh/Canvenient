import asyncio
import bcrypt
import json
from database import db
from datetime import datetime, timedelta
import random

async def create_demo_data():
    await db.connect()
    print("Connected to the database.")
    
    # 1. Create User
    email = "demo@canvenient.app"
    password = "password123"
    hashed_password = bcrypt.hashpw(password.encode(), bcrypt.gensalt())
    
    user = await db.fetch_one("SELECT * FROM users WHERE email = :email", {"email": email})
    if not user:
        query = """
            INSERT INTO users (email, hashed_password)
            VALUES (:email, :hashed_password)
            RETURNING id
        """
        user_id = await db.execute(query, {"email": email, "hashed_password": hashed_password})
        
        settings_query = "INSERT INTO user_settings (user_id, name, theme) VALUES (:user_id, :name, :theme)"
        try:
            await db.execute(settings_query, {"user_id": user_id, "name": "Demo User", "theme": "dark"})
        except Exception as e:
            pass
        print(f"Created demo user: {email} / {password}")
    else:
        user_id = user["id"]
        print(f"Demo user already exists: {email} / {password}")
        await db.execute("DELETE FROM tasks WHERE user_id = :user_id", {"user_id": user_id})
        await db.execute("DELETE FROM academic_modules WHERE user_id = :user_id", {"user_id": user_id})
        await db.execute("DELETE FROM categories WHERE user_id = :user_id", {"user_id": user_id})
        await db.execute("DELETE FROM classes WHERE user_id = :user_id", {"user_id": user_id})
        await db.execute("DELETE FROM canvas_api_cache WHERE user_id = :user_id", {"user_id": user_id})

    # 2. Create Categories
    categories = [
        {"name": "Urgent", "color": "#f43f5e"},
        {"name": "Study", "color": "#38bdf8"},
        {"name": "Personal", "color": "#10b981"}
    ]
    cat_ids = {}
    for cat in categories:
        query = "INSERT INTO categories (user_id, name, color) VALUES (:user_id, :name, :color) RETURNING id"
        cat_id = await db.execute(query, {"user_id": user_id, "name": cat["name"], "color": cat["color"]})
        cat_ids[cat["name"]] = cat_id

    # 3. Create Modules & Schedule Classes
    modules = [
        {"code": "CS2040S", "name": "Data Structures and Algorithms"},
        {"code": "MA1521", "name": "Calculus for Computing"}
    ]
    mod_ids = {}
    for mod in modules:
        query = "INSERT INTO academic_modules (user_id, module_code, name) VALUES (:user_id, :module_code, :name) RETURNING id"
        mod_id = await db.execute(query, {"user_id": user_id, "module_code": mod["code"], "name": mod["name"]})
        mod_ids[mod["code"]] = mod_id
        
        today = datetime.now()
        day_of_week = str(today.isoweekday())
        
        c_query = """
            INSERT INTO classes (user_id, module_code, module_name, lesson_type, venue, day_of_week, start_time, end_time)
            VALUES (:user_id, :module_code, :module_name, :lesson_type, :venue, :day_of_week, :start_time, :end_time)
        """
        c_values = {
            "user_id": user_id,
            "module_code": mod["code"],
            "module_name": mod["name"],
            "lesson_type": "Lecture",
            "venue": "LT19",
            "day_of_week": day_of_week,
            "start_time": "10:00:00" if mod["code"] == "CS2040S" else "14:00:00",
            "end_time": "12:00:00" if mod["code"] == "CS2040S" else "16:00:00",
        }
        await db.execute(c_query, c_values)

    # 4. Create Tasks
    now = datetime.now()
    tasks = [
        {"title": "Complete CS2040S Problem Set 3", "status": "todo", "priority": "high", "cat_id": cat_ids["Urgent"], "due_at": now + timedelta(days=1)},
        {"title": "Revise MA1521 Chapter 4", "status": "todo", "priority": "medium", "cat_id": cat_ids["Study"], "due_at": now + timedelta(days=2)},
        {"title": "Buy groceries", "status": "todo", "priority": "low", "cat_id": cat_ids["Personal"], "due_at": None},
        {"title": "Submit final report draft", "status": "done", "priority": "high", "cat_id": cat_ids["Urgent"], "due_at": now - timedelta(days=1)}
    ]
    for task in tasks:
        t_query = """
            INSERT INTO tasks (user_id, title, status, priority_manual, category_id, due_at_override)
            VALUES (:user_id, :title, :status, :priority_manual, :category_id, :due_at_override)
        """
        await db.execute(t_query, {
            "user_id": user_id,
            "title": task["title"],
            "status": task["status"],
            "priority_manual": task["priority"],
            "category_id": task["cat_id"],
            "due_at_override": task["due_at"].isoformat() if task["due_at"] else None
        })

    # 5. Canvas Cache
    assignments = [
        {"id": 1001, "course_id": 1, "course_code": "CS2040S", "course_name": "Data Structures", "title": "Midterm Exam", "due_at": (now + timedelta(days=3)).isoformat(), "is_priority": True, "has_submitted": False},
        {"id": 1002, "course_id": 1, "course_code": "MA1521", "course_name": "Calculus", "title": "Weekly Quiz 5", "due_at": (now + timedelta(days=5)).isoformat(), "is_priority": False, "has_submitted": False}
    ]
    announcements = [
        {"id": 2001, "course_id": 1, "course_code": "CS2040S", "title": "Welcome to CS2040S!", "message": "Here is the syllabus and schedule.", "posted_at": (now - timedelta(days=2)).isoformat()},
        {"id": 2002, "course_id": 1, "course_code": "MA1521", "title": "Room change for tomorrow's lecture", "message": "We will be in LT27 instead of LT19.", "posted_at": (now - timedelta(days=1)).isoformat()}
    ]
    
    await db.execute("""
        INSERT INTO canvas_api_cache (user_id, cache_key, data)
        VALUES (:user_id, 'assignments', :data)
    """, {"user_id": user_id, "data": json.dumps(assignments)})
    
    await db.execute("""
        INSERT INTO canvas_api_cache (user_id, cache_key, data)
        VALUES (:user_id, 'announcements', :data)
    """, {"user_id": user_id, "data": json.dumps(announcements)})

    await db.disconnect()
    print("Done! Demo data is ready. You can log in with demo@canvenient.app / password123")

if __name__ == "__main__":
    import asyncio
    asyncio.run(create_demo_data())
