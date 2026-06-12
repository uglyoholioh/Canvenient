from contextlib import asynccontextmanager

from fastapi import FastAPI
from database import db
from routes.academic_modules import router as academic_modules_router
from routes.auth import router as auth_router
from routes.categories import router as categories_router
from routes.tasks import router as tasks_router
from routes.canvas import router as canvas_router
from routes.schedule import router as schedule_router
from schema import initialize_schema


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.connect()
    await initialize_schema()
    yield
    await db.disconnect()


app = FastAPI(lifespan=lifespan)
app.include_router(auth_router)
app.include_router(categories_router)
app.include_router(academic_modules_router)
app.include_router(tasks_router)
app.include_router(canvas_router)
app.include_router(schedule_router)


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

