from contextlib import asynccontextmanager

from fastapi import FastAPI
from database import db
from routes.auth import router as auth_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Connect to the database on startup
    await db.connect()
    yield
    # Disconnect from the database on shutdown
    await db.disconnect()


app = FastAPI(lifespan=lifespan)
app.include_router(auth_router)


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

