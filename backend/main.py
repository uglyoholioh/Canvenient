from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import db
from routes.academic_modules import router as academic_modules_router
from routes.auth import router as auth_router
from routes.categories import router as categories_router
from routes.tasks import router as tasks_router
from routes.canvas import router as canvas_router
from routes.schedules import router as schedule_router
from routes.events import router as events_router
from routes.ai import router as ai_router
from routes.communities import router as communities_router
from routes.groups import router as groups_router
from routes.invites import router as invites_router
from routes.forms import router as forms_router
from routes.notifications import router as notifications_router
from routes.study_sessions import router as study_sessions_router


from schema import initialize_schema


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.connect()
    await initialize_schema()
    yield
    await db.disconnect()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth_router)
app.include_router(categories_router)
app.include_router(academic_modules_router)
app.include_router(tasks_router)
app.include_router(canvas_router)
app.include_router(schedule_router)
app.include_router(events_router)
app.include_router(ai_router)
app.include_router(communities_router)
app.include_router(groups_router)
app.include_router(invites_router)
app.include_router(forms_router)
app.include_router(notifications_router)
app.include_router(study_sessions_router)




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

