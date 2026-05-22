from fastapi import FastAPI
from database import db
from routes.auth import router as auth_router
app = FastAPI()
app.include_router(auth_router)


@app.get("/")
def root():
    return {"message": "CanVenient API is running"}


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/db-test")
async def db_test():
    collections = await db.list_collection_names()
    return {"collections": collections, "connected": True}
