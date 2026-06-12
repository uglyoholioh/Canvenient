# pyrefly: ignore [missing-import]
from fastapi import APIRouter, HTTPException, status, UploadFile
from database import db
from dependencies import CurrentUser
from datetime import timezone, timedelta
from icalendar import Calendar


def extract_ics(component):
    summary = str(component.get("SUMMARY",""))
    if not summary:
        return None
    
    module_code, class_type = summary_parser(summary)
    module_name, class_no = parse_desc(str(component.get("DESCRIPTION", "")), class_type)

    rrule = component.get("RRULE")
    if rrule:
        day_map = {"MO": 1, "TU": 2, "WE": 3, "TH": 4, "FR": 5, "SA": 6, "SU": 7}
        byday = rrule.get("BYDAY")
        day_of_week = day_map.get(str(byday[0]).upper(), 0) if byday else 0

        start_time = to_sgt(component.get("DTSTART").dt)
        end_time = to_sgt(component.get("DTEND").dt)
        venue = str(component.get("LOCATION"))

        return {
            "type": "class",
            "module_code": module_code,
            "module_name": module_name,
            "lesson_type": class_type,
            "class_no": class_no,
            "day_of_week": day_of_week,
            "start_time": start_time,
            "end_time": end_time,
            "venue": venue,
        }
    else:
        start_dt = component.get("DTSTART").dt
        end_dt = component.get("DTEND").dt

        return {
            "type": "exam",
            "module_code": module_code,
            "module_name": module_name,
            "start_at": start_dt.isoformat(),
            "end_at": end_dt.isoformat(),
        }


router = APIRouter(prefix = "/schedule", tags = ["schedule"])

def summary_parser(module: str):
    module_code, class_type = module.split(" ", 1)
    return (module_code, class_type)

def parse_desc(desc_text, class_type):
    lines = desc_text.split("\n")
    module_name = lines[0].strip() if lines else ""

    class_no = None
    for line in lines:
        if class_type.lower() in line.lower():
            class_no = line.strip()
            break

    return module_name, class_no

SGT = timezone(timedelta(hours=8))

def to_sgt(dt):
    return dt.astimezone(SGT).strftime("%H:%M:%S")

@router.post("/import/ics", status_code = status.HTTP_201_CREATED)
async def import_ics(file: UploadFile, current_user: CurrentUser):
    filename = file.filename or ""
    if not filename.lower().endswith(".ics"):
        raise HTTPException(
            status_code = status.HTTP_400_BAD_REQUEST,
            detail = "Invalid file type. Please upload an .ics file."
        )

    cal_data = await file.read()
    calendar_text = cal_data.decode("utf-8")
    calendar = Calendar.from_ical(calendar_text)
    classes = []
    exams = []
    for component in calendar.walk():
        if component.name == "VEVENT":
            event = extract_ics(component)
            if event:
                if event["type"] == "class":
                    classes.append(event)
                else:
                    exams.append(event)
    async with db.transaction():
        await db.execute(
            query="DELETE FROM classes WHERE user_id = :user_id",
            values={"user_id": current_user.id}
        )
        await db.execute(
            query="DELETE FROM exams WHERE user_id = :user_id",
            values={"user_id": current_user.id}
        )
        db_classes = [
            {
                "user_id": current_user.id,
                "module_code": c["module_code"],
                "module_name": c["module_name"],
                "lesson_type": c["lesson_type"],
                "class_no": c["class_no"],
                "day_of_week": c["day_of_week"],
                "start_time": c["start_time"],
                "end_time": c["end_time"],
                "venue": c["venue"],
            }
            for c in classes
        ]
        db_exams = [
            {
                "user_id": current_user.id,
                "module_code": e["module_code"],
                "module_name": e["module_name"],
                "start_at": e["start_at"],
                "end_at": e["end_at"],
            }
            for e in exams
        ]
        if db_classes:
            await db.execute_many(
                query="""
                    INSERT INTO classes (user_id, module_code, module_name, lesson_type, class_no, day_of_week, start_time, end_time, venue)
                    VALUES (:user_id, :module_code, :module_name, :lesson_type, :class_no, :day_of_week, :start_time, :end_time, :venue)
                """,
                values=db_classes,
            )
        if db_exams:
            await db.execute_many(
                query="""
                    INSERT INTO exams (user_id, module_code, module_name, start_at, end_at)
                    VALUES (:user_id, :module_code, :module_name, :start_at, :end_at)
                """,
                values=db_exams,
            )
    return {"classes": len(classes), "exams": len(exams)}

    
