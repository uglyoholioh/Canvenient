# pyrefly: ignore [missing-import]
from models.schedule import ScheduleOut, ClassOut, ExamOut
from fastapi import APIRouter, HTTPException, status, UploadFile
from database import db
from dependencies import CurrentUser
from datetime import datetime, date, time
from icalendar import Calendar
from zoneinfo import ZoneInfo
from dateutil.rrule import rrulestr, rruleset

router = APIRouter(prefix = "/schedule", tags = ["schedule"])

SGT = ZoneInfo("Asia/Singapore")

def to_sgt_datetime(dt):
    if isinstance(dt, datetime):
        return dt.replace(tzinfo=SGT) if dt.tzinfo is None else dt.astimezone(SGT)
    return datetime.combine(dt, time.min, tzinfo=SGT)

def summary_parser(module: str):
    parts = module.split(" ", 1)
    if len(parts) == 2:
        return parts[0], parts[1]
    return module, ""

def parse_desc(desc_text, class_type):
    lines = desc_text.split("\n")
    module_name = lines[0].strip() if lines else ""

    class_no = None
    for line in lines:
        if class_type.lower() in line.lower():
            class_no = line.strip()
            break

    return module_name, class_no

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
            summary = str(component.get("SUMMARY", ""))
            if not summary:
                continue
                
            module_code, class_type = summary_parser(summary)
            module_name, class_no = parse_desc(str(component.get("DESCRIPTION", "")), class_type)
            
            if "exam" in class_type.lower() or "exam" in summary.lower():
                dtstart = component.get("DTSTART").dt
                dtend = component.get("DTEND").dt
                
                start_sgt = to_sgt_datetime(dtstart)
                end_sgt = to_sgt_datetime(dtend)
                
                exams.append({
                    "user_id": current_user.id,
                    "module_code": module_code,
                    "module_name": module_name,
                    "start_at": start_sgt,
                    "end_at": end_sgt,
                })
                continue
            
            dtstart = component.get("DTSTART").dt
            dtend = component.get("DTEND").dt
            rrule = component.get("RRULE")
            venue = str(component.get("LOCATION") or "")
            
            exdates = component.get("EXDATE")
            exdate_list = []
            if exdates:
                if not isinstance(exdates, list):
                    exdates = [exdates]
                for ex in exdates:
                    if hasattr(ex, "dts"):
                        for dt_item in ex.dts:
                            exdate_list.append(dt_item.dt)
                    elif hasattr(ex, "dt"):
                        exdate_list.append(ex.dt)
                    else:
                        exdate_list.append(ex)
            
            is_dtstart_aware = (dtstart.tzinfo is not None)
            normalized_exdates = []
            for ex_dt in exdate_list:
                if type(ex_dt) is date:
                    ex_dt = datetime.combine(ex_dt, time.min)
                if is_dtstart_aware:
                    if ex_dt.tzinfo is None:
                        ex_dt = ex_dt.replace(tzinfo=timezone.utc)
                else:
                    if ex_dt.tzinfo is not None:
                        ex_dt = ex_dt.replace(tzinfo=None)
                normalized_exdates.append(ex_dt)
                
            if rrule:
                rrule_str = rrule.to_ical().decode("utf-8")
                rset = rruleset()
                if type(dtstart) is date:
                    dtstart_dt = datetime.combine(dtstart, time.min)
                else:
                    dtstart_dt = dtstart
                
                rset.rrule(rrulestr(rrule_str, dtstart=dtstart_dt))
                for ex_dt in normalized_exdates:
                    rset.exdate(ex_dt)
                    
                occurrences = list(rset[:100])
                duration = dtend - dtstart
                for occurrence in occurrences:
                    occ_start = occurrence
                    occ_end = occurrence + duration
                    
                    start_sgt = to_sgt_datetime(occ_start)
                    end_sgt = to_sgt_datetime(occ_end)
                    
                    classes.append({
                        "user_id": current_user.id,
                        "module_code": module_code,
                        "module_name": module_name,
                        "lesson_type": class_type,
                        "class_no": class_no,
                        "day_of_week": start_sgt.isoweekday(),
                        "start_time": start_sgt.time(),
                        "end_time": end_sgt.time(),
                        "venue": venue,
                        "class_date": start_sgt.date(),
                    })
            else:
                start_sgt = to_sgt_datetime(dtstart)
                end_sgt = to_sgt_datetime(dtend)
                
                classes.append({
                    "user_id": current_user.id,
                    "module_code": module_code,
                    "module_name": module_name,
                    "lesson_type": class_type,
                    "class_no": class_no,
                    "day_of_week": start_sgt.isoweekday(),
                    "start_time": start_sgt.time(),
                    "end_time": end_sgt.time(),
                    "venue": venue,
                    "class_date": start_sgt.date(),
                })
                
    async with db.transaction():
        await db.execute(
            query="DELETE FROM classes WHERE user_id = :user_id",
            values={"user_id": current_user.id}
        )
        await db.execute(
            query="DELETE FROM exams WHERE user_id = :user_id",
            values={"user_id": current_user.id}
        )
        if classes:
            await db.execute_many(
                query="""
                    INSERT INTO classes (user_id, module_code, module_name, lesson_type, class_no, day_of_week, start_time, end_time, venue, class_date)
                    VALUES (:user_id, :module_code, :module_name, :lesson_type, :class_no, :day_of_week, :start_time, :end_time, :venue, :class_date)
                """,
                values=classes,
            )
        if exams:
            await db.execute_many(
                query="""
                    INSERT INTO exams (user_id, module_code, module_name, start_at, end_at)
                    VALUES (:user_id, :module_code, :module_name, :start_at, :end_at)
                """,
                values=exams,
            )
            
    return {"classes": len(classes), "exams": len(exams)}

@router.get("", response_model=ScheduleOut)
async def list_schedule(current_user: CurrentUser):
    classes = await db.fetch_all(
        query = "SELECT * FROM classes WHERE user_id = :user_id",
        values = {"user_id": current_user.id},
    )
    exams = await db.fetch_all(
        query = "SELECT * FROM exams WHERE user_id = :user_id",
        values = {"user_id": current_user.id},
    )
    events = await db.fetch_all(
        query = """
            SELECT DISTINCT e.*,
                   CASE WHEN ea.is_attending IS NOT NULL THEN ea.is_attending
                        WHEN e.user_id = :user_id THEN TRUE
                        ELSE FALSE
                   END AS is_attending
            FROM events e
            LEFT JOIN g_members gm ON gm.g_id = e.g_id
            LEFT JOIN groups g ON g.c_id = e.c_id
            LEFT JOIN g_members gm_comm ON gm_comm.g_id = g.id
            LEFT JOIN event_attendance ea ON ea.e_id = e.id AND ea.user_id = :user_id
            WHERE e.user_id = :user_id
               OR gm.user_id = :user_id
               OR gm_comm.user_id = :user_id
        """,
        values = {"user_id": current_user.id},
    )
    return {
        "classes": classes,
        "exams": exams,
        "events": events
    }
