from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, WebSocket, WebSocketDisconnect
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from contextlib import asynccontextmanager
import os
import logging
import uuid
from pathlib import Path
from dotenv import load_dotenv
from datetime import datetime, timezone
import requests

from models import *
from auth import get_password_hash, verify_password, create_access_token, get_current_user
from market_timing import get_market_status
from trade_engine import validate_trade, execute_trade
from websocket_manager import ws_manager

# --------------------------------------------------
# ENV LOAD
# --------------------------------------------------

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

UPSTOX_CLIENT_ID = os.getenv("UPSTOX_CLIENT_ID")
UPSTOX_CLIENT_SECRET = os.getenv("UPSTOX_CLIENT_SECRET")
UPSTOX_REDIRECT_URI = os.getenv("UPSTOX_REDIRECT_URI")

STARTING_CAPITAL = 1000000

# --------------------------------------------------
# DATABASE (ONLY ONE CLIENT)
# --------------------------------------------------

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

# --------------------------------------------------
# LOGGING
# --------------------------------------------------

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --------------------------------------------------
# SAMPLE STOCKS
# --------------------------------------------------

SAMPLE_STOCKS = [
    {"instrument_key": "NSE_EQ|INE002A01018", "trading_symbol": "RELIANCE", "name": "Reliance Industries Ltd"},
    {"instrument_key": "NSE_EQ|INE467B01029", "trading_symbol": "TCS", "name": "Tata Consultancy Services Ltd"},
    {"instrument_key": "NSE_EQ|INE040A01034", "trading_symbol": "INFY", "name": "Infosys Ltd"},
    {"instrument_key": "NSE_EQ|INE009A01021", "trading_symbol": "HDFCBANK", "name": "HDFC Bank Ltd"},
]

# --------------------------------------------------
# STARTUP
# --------------------------------------------------

async def initialize_sample_data():
    if await db.instruments.count_documents({}) == 0:
        await db.instruments.insert_many(SAMPLE_STOCKS)

async def initialize_default_admin():
    admin_exists = await db.users.find_one({"email": "admin@campus.edu"})
    if not admin_exists:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "username": "admin",
            "email": "admin@campus.edu",
            "password": get_password_hash("Admin@123"),
            "role": UserRole.ADMIN,
            "virtual_balance": STARTING_CAPITAL,
            "trade_count": 0,
            "created_at": datetime.now(timezone.utc).isoformat()
        })

@asynccontextmanager
async def lifespan(app: FastAPI):
    await initialize_sample_data()
    await initialize_default_admin()

    import asyncio
    feed_task = asyncio.create_task(ws_manager.connect_upstox_feed(db))
    logger.info("Upstox feed task started")

    yield

    feed_task.cancel()
    client.close()

app = FastAPI(title="Campus Trading Platform", lifespan=lifespan)
api_router = APIRouter(prefix="/api")

# --------------------------------------------------
# CORS
# --------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://astra-trade.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------------------------------------
# UPSTOX CALLBACK (ASYNC STORAGE)
# --------------------------------------------------

@app.get("/api/auth/callback")
async def upstox_callback(code: str):

    token_response = requests.post(
        "https://api.upstox.com/v2/login/authorization/token",
        data={
            "code": code,
            "client_id": UPSTOX_CLIENT_ID,
            "client_secret": UPSTOX_CLIENT_SECRET,
            "redirect_uri": UPSTOX_REDIRECT_URI,
            "grant_type": "authorization_code"
        }
    )

    token_data = token_response.json()
    access_token = token_data.get("access_token")

    if not access_token:
        return {"error": "Failed to get access token"}

    await db.app_settings.update_one(
        {"key": "upstox_token"},
        {
            "$set": {
                "access_token": access_token,
                "updated_at": datetime.utcnow()
            }
        },
        upsert=True
    )

    logger.info("Upstox token stored in MongoDB")

    return {
        "message": "Upstox connected successfully",
        "access_token_received": True
    }

# --------------------------------------------------
# AUTH
# --------------------------------------------------

@api_router.post("/auth/login", response_model=Token)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email})
    if not user or not verify_password(credentials.password, user["password"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    access_token = create_access_token(data={"sub": user["id"], "email": user["email"], "role": user["role"]})

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

# --------------------------------------------------
# WEBSOCKET
# --------------------------------------------------

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

# --------------------------------------------------
# INCLUDE ROUTER
# --------------------------------------------------

app.include_router(api_router)

@app.get("/health")
async def health_check():
    return {"status": "healthy"}