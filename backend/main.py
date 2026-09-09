from contextlib import asynccontextmanager
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import db
from routes.academic_modules import router as academic_modules_router
from routes.module_colors import router as module_colors_router
from routes.auth import router as auth_router
from routes.categories import router as categories_router
from routes.tasks import router as tasks_router
from routes.canvas import router as canvas_router
from routes.schedules import router as schedule_router
from routes.campus_bus import router as campus_bus_router
from routes.events import router as events_router
from routes.ai import router as ai_router
from routes.communities import router as communities_router
from routes.groups import router as groups_router
from routes.invites import router as invites_router
from routes.forms import router as forms_router
from routes.notifications import router as notifications_router
from routes.study_sessions import router as study_sessions_router
from routes.telegram import router as telegram_router
from routes.notes import router as notes_router
from routes.folders import router as folders_router
from routes.venues import router as venues_router


from schema import initialize_schema


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.connect()
    await initialize_schema()
    yield
    await db.disconnect()


app = FastAPI(lifespan=lifespan)

# Only the app's own surfaces may call the API: the packaged Tauri webview
# (tauri://localhost) and the Vite dev server. Override with
# CANVENIENT_ALLOWED_ORIGINS (comma-separated) for server deployments.
DEFAULT_ALLOWED_ORIGINS = [
    "tauri://localhost",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
_configured_origins = [
    origin.strip()
    for origin in os.getenv("CANVENIENT_ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_configured_origins or DEFAULT_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth_router)
app.include_router(categories_router)
app.include_router(academic_modules_router)
app.include_router(module_colors_router)
app.include_router(tasks_router)
app.include_router(canvas_router)
app.include_router(schedule_router)
app.include_router(campus_bus_router)
app.include_router(events_router)
app.include_router(ai_router)
app.include_router(communities_router)
app.include_router(groups_router)
app.include_router(invites_router)
app.include_router(forms_router)
app.include_router(notifications_router)
app.include_router(study_sessions_router)
app.include_router(telegram_router)
app.include_router(notes_router)
app.include_router(folders_router)
app.include_router(venues_router)




@app.get("/")
def root():
    return {"message": "CanVenient API is running"}


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/db-test")
async def db_test():
    result = await db.fetch_val("SELECT 1")
    return {"result": result, "connected": True}
