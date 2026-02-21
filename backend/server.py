from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, WebSocket, WebSocketDisconnect
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from contextlib import asynccontextmanager
import os
import logging
import uuid
from datetime import datetime, timezone
from models import *
from auth import get_password_hash, verify_password, create_access_token, get_current_user
from websocket_manager import ws_manager
import requests

# ---------------- DATABASE ---------------- #

STARTING_CAPITAL = 1000000
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------- LIFESPAN ---------------- #

@asynccontextmanager
async def lifespan(app: FastAPI):
    import asyncio
    feed_task = asyncio.create_task(ws_manager.connect_upstox_feed())
    yield
    feed_task.cancel()

app = FastAPI(lifespan=lifespan)

api_router = APIRouter(prefix="/api")

# ---------------- CORS ---------------- #

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://astra-trade.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------- AUTH ---------------- #

@api_router.post("/auth/login", response_model=Token)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email})
    if not user or not verify_password(credentials.password, user["password"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    access_token = create_access_token(data={"sub": user["id"], "role": user["role"]})

    return Token(
        access_token=access_token,
        token_type="bearer",
        user=User(
            id=user["id"],
            username=user["username"],
            email=user["email"],
            role=user["role"],
            virtual_balance=user["virtual_balance"],
            trade_count=user["trade_count"],
            created_at=datetime.fromisoformat(user["created_at"])
        )
    )

# ---------------- MARKET STATUS ---------------- #

@api_router.get("/market/status")
async def market_status():
    return {"market_open": True}

# ---------------- WEBSOCKET ---------------- #

@api_router.websocket("/ws/prices")
async def websocket_prices(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            if data.get("action") == "subscribe":
                await ws_manager.subscribe(data.get("instruments", []))
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)

# ---------------- INCLUDE ROUTER ---------------- #

app.include_router(api_router)

@app.get("/health")
async def health_check():
    return {"status": "healthy"}