from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, WebSocket, WebSocketDisconnect
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from contextlib import asynccontextmanager
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
import aiohttp
import os
import logging
import uuid
from pathlib import Path
from dotenv import load_dotenv
from datetime import datetime, timezone, timedelta
from models import *
from auth import get_password_hash, verify_password, create_access_token, get_current_user
from market_timing import get_market_status, is_market_open, get_current_ist_time
from trade_engine import validate_trade, execute_trade
from websocket_manager import ws_manager
import requests
import httpx

# ---------------- ENV LOAD ---------------- #

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

UPSTOX_CLIENT_ID = os.getenv("UPSTOX_CLIENT_ID")
UPSTOX_CLIENT_SECRET = os.getenv("UPSTOX_CLIENT_SECRET")
UPSTOX_REDIRECT_URI = os.getenv("UPSTOX_REDIRECT_URI")
UPSTOX_TOKEN_URL = "https://api.upstox.com/v2/login/authorization/token"

# ---------------- DATABASE ---------------- #

STARTING_CAPITAL = 1000000

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# ---------------- LOGGING ---------------- #

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------- SAMPLE STOCKS ---------------- #

SAMPLE_STOCKS = [
    {"instrument_key": "NSE_EQ|INE002A01018", "trading_symbol": "RELIANCE", "name": "Reliance Industries Ltd", "segment": "NSE_EQ", "exchange": "NSE", "instrument_type": "EQ"},
    {"instrument_key": "NSE_EQ|INE467B01029", "trading_symbol": "TCS", "name": "Tata Consultancy Services Ltd", "segment": "NSE_EQ", "exchange": "NSE", "instrument_type": "EQ"},
    {"instrument_key": "NSE_EQ|INE040A01034", "trading_symbol": "INFY", "name": "Infosys Ltd", "segment": "NSE_EQ", "exchange": "NSE", "instrument_type": "EQ"},
    {"instrument_key": "NSE_EQ|INE009A01021", "trading_symbol": "HDFCBANK", "name": "HDFC Bank Ltd", "segment": "NSE_EQ", "exchange": "NSE", "instrument_type": "EQ"},
    {"instrument_key": "NSE_EQ|INE090A01021", "trading_symbol": "ICICIBANK", "name": "ICICI Bank Ltd", "segment": "NSE_EQ", "exchange": "NSE", "instrument_type": "EQ"},
    {"instrument_key": "NSE_EQ|INE018A01030", "trading_symbol": "WIPRO", "name": "Wipro Ltd", "segment": "NSE_EQ", "exchange": "NSE", "instrument_type": "EQ"},
    {"instrument_key": "NSE_EQ|INE155A01022", "trading_symbol": "TATAMOTORS", "name": "Tata Motors Ltd", "segment": "NSE_EQ", "exchange": "NSE", "instrument_type": "EQ"},
    {"instrument_key": "NSE_EQ|INE437A01024", "trading_symbol": "APOLLOHOSP", "name": "Apollo Hospitals Enterprise Ltd", "segment": "NSE_EQ", "exchange": "NSE", "instrument_type": "EQ"},
]

async def initialize_sample_data():
    existing = await db.instruments.count_documents({})
    if existing == 0:
        await db.instruments.insert_many(SAMPLE_STOCKS)
        logger.info(f"Initialized {len(SAMPLE_STOCKS)} sample stocks")

async def initialize_default_admin():
    admin_exists = await db.users.find_one({"email": "admin@campus.edu"})
    if not admin_exists:
        admin_id = str(uuid.uuid4())
        admin_user = {
            "id": admin_id,
            "username": "admin",
            "email": "admin@campus.edu",
            "password": get_password_hash("Admin@123"),
            "role": UserRole.ADMIN,
            "virtual_balance": STARTING_CAPITAL,
            "trade_count": 0,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(admin_user)
        logger.info("Default admin user created: admin@campus.edu / Admin@123")

# ---------------- LIFESPAN ---------------- #

@asynccontextmanager
async def lifespan(app: FastAPI):
    await initialize_sample_data()
    await initialize_default_admin()

    import asyncio
    feed_task = asyncio.create_task(ws_manager.connect_upstox_feed())

    logger.info("WebSocket price feed started")

    yield

    feed_task.cancel()
    client.close()

app = FastAPI(title="Campus Trading Platform", version="1.0.0", lifespan=lifespan)
api_router = APIRouter(prefix="/api")

# ---------------- CORS ---------------- #

origins = ["https://astra-trade.vercel.app"]

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------- UPSTOX CALLBACK ---------------- #

@app.get("/api/auth/callback")
async def upstox_callback(code: str):

    token_response = requests.post(
        UPSTOX_TOKEN_URL,
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
        return {"error": token_data}

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

    return {
        "message": "Upstox connected successfully",
        "access_token_received": True
    }

# ---------------- INCLUDE ROUTER ---------------- #

app.include_router(api_router)

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "campus-trading-platform"}