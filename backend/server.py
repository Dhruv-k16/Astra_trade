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
from pymongo import MongoClient
from fastapi import Query 

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

UPSTOX_CLIENT_ID = os.getenv("UPSTOX_CLIENT_ID")
UPSTOX_CLIENT_SECRET = os.getenv("UPSTOX_CLIENT_SECRET")
UPSTOX_REDIRECT_URI = os.getenv("UPSTOX_REDIRECT_URI")

UPSTOX_TOKEN_URL = "https://api.upstox.com/v2/login/authorization/token"

# Configuration
STARTING_CAPITAL = 1000000
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Sample NSE stocks (in production, this would come from Upstox API)
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
    """Initialize sample stocks in database"""
    existing = await db.instruments.count_documents({})
    if existing == 0:
        await db.instruments.insert_many(SAMPLE_STOCKS)
        logger.info(f"Initialized {len(SAMPLE_STOCKS)} sample stocks")

async def initialize_default_admin():
    """Create default admin user if not exists"""
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

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await initialize_sample_data()
    await initialize_default_admin()

    # Start WebSocket price feed in background
    import asyncio
    feed_task = asyncio.create_task(ws_manager.connect_upstox_feed())


    logger.info("WebSocket price feed started")

    yield

    # Shutdown
    feed_task.cancel()
    client.close()

app = FastAPI(title="Campus Trading Platform", version="1.0.0", lifespan=lifespan)
api_router = APIRouter(prefix="/api")

# CORS
origins=["https://astra-trade.vercel.app",]
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============= AUTHENTICATION ROUTES =============

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

    # ✅ FIX: await added
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


@api_router.post("/auth/register", response_model=Token)
async def register(user_data: UserCreate):
    """Register a new user"""
    # Check if user exists
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user_id = str(uuid.uuid4())
    user_dict = {
        "id": user_id,
        "username": user_data.username,
        "email": user_data.email,
        "password": get_password_hash(user_data.password),
        "role": user_data.role,
        "virtual_balance": STARTING_CAPITAL,
        "trade_count": 0,
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    await db.users.insert_one(user_dict)

    # Create access token
    access_token = create_access_token(data={"sub": user_id, "email": user_data.email, "role": user_data.role})

    user_response = User(
        id=user_id,
        username=user_data.username,
        email=user_data.email,
        role=user_data.role,
        virtual_balance=STARTING_CAPITAL,
        trade_count=0,
        created_at=datetime.fromisoformat(user_dict["created_at"])
    )

    return Token(access_token=access_token, token_type="bearer", user=user_response)

@api_router.post("/auth/login", response_model=Token)
async def login(credentials: UserLogin):
    """Login user"""
    user = await db.users.find_one({"email": credentials.email})
    if not user or not verify_password(credentials.password, user["password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    access_token = create_access_token(data={"sub": user["id"], "email": user["email"], "role": user["role"]})

    user_response = User(
        id=user["id"],
        username=user["username"],
        email=user["email"],
        role=user["role"],
        virtual_balance=user["virtual_balance"],
        trade_count=user["trade_count"],
        created_at=datetime.fromisoformat(user["created_at"])
    )

    return Token(access_token=access_token, token_type="bearer", user=user_response)

@api_router.get("/auth/me", response_model=User)
async def get_me(current_user: dict = Depends(get_current_user)):
    """Get current user info"""
    user = await db.users.find_one({"id": current_user["sub"]})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return User(
        id=user["id"],
        username=user["username"],
        email=user["email"],
        role=user["role"],
        virtual_balance=user["virtual_balance"],
        trade_count=user["trade_count"],
        created_at=datetime.fromisoformat(user["created_at"])
    )

# ============= MARKET STATUS =============

@api_router.get("/market/status", response_model=MarketStatus)
async def market_status():
    """Get current market status"""
    config = await db.contest_config.find_one() or {"trading_active": True}
    return get_market_status(config.get("trading_active", True))

# ============= STOCK SEARCH =============

@api_router.get("/stocks/search")
async def search_stocks(q: str = Query("", min_length=0)):

    # Real NSE equity stocks have instrument_key starting with "NSE_EQ|INE"
    base_filter = {
        "instrument_key": {"$regex": "^NSE_EQ\\|INE", "$options": ""}
    }

    projection = {
        "_id": 0,
        "instrument_key": 1,
        "symbol": 1,
        "name": 1,
        "exchange": 1,
        "segment": 1
    }

    if not q:
        # Return well-known Nifty 50 stocks by symbol name
        popular = [
            "RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK",
            "WIPRO", "SBIN", "BAJFINANCE", "HINDUNILVR", "AXISBANK",
            "KOTAKBANK", "LT", "ITC", "TATAMOTORS", "MARUTI",
            "SUNPHARMA", "TITAN", "ULTRACEMCO", "NESTLEIND", "POWERGRID"
        ]
        stocks = await db.instruments.find(
            {**base_filter, "symbol": {"$in": popular}},
            projection
        ).to_list(20)

        # If popular stocks not found (symbol mismatch), fall back to any NSE_EQ|INE stocks
        if not stocks:
            stocks = await db.instruments.find(base_filter, projection).limit(20).to_list(20)
    else:
        stocks = await db.instruments.find(
            {
                **base_filter,
                "$or": [
                    {"symbol": {"$regex": q, "$options": "i"}},
                    {"name": {"$regex": q, "$options": "i"}}
                ]
            },
            projection
        ).limit(20).to_list(20)

    # Add trading_symbol alias so frontend works without changes
    for s in stocks:
        s["trading_symbol"] = s.get("symbol", "")

    return {"results": stocks}

# ============= STOCK PRICES =============

@api_router.websocket("/ws/prices")
async def websocket_prices(websocket: WebSocket):
    """WebSocket endpoint for real-time price updates"""
    await ws_manager.connect(websocket)

    try:
        while True:
            # Receive subscription requests from client
            data = await websocket.receive_json()

            if data.get("action") == "subscribe":
                instrument_keys = data.get("instruments", [])
                await ws_manager.subscribe(instrument_keys)

                # Send current cached prices immediately
                for key in instrument_keys:
                    if key in ws_manager.price_cache:
                        await websocket.send_json({
                            "type": "price_update",
                            "instrument_key": key,
                            "data": ws_manager.price_cache[key]
                        })

            elif data.get("action") == "unsubscribe":
                instrument_keys = data.get("instruments", [])
                await ws_manager.unsubscribe(instrument_keys)

    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        ws_manager.disconnect(websocket)

@api_router.get("/stocks/price/{instrument_key}")
async def get_stock_price(instrument_key: str):
    """Get current price for a stock (fallback for non-WebSocket clients)"""
    if instrument_key in ws_manager.price_cache:
        return ws_manager.price_cache[instrument_key]
    else:
        raise HTTPException(status_code=404, detail="Price not found")

@api_router.get("/stocks/prices")
async def get_multiple_prices(instrument_keys: str):
    """Get prices for multiple stocks (comma-separated)"""
    keys = instrument_keys.split(",")
    prices = {}
    for key in keys:
        if key in ws_manager.price_cache:
            prices[key] = ws_manager.price_cache[key]
    return {"prices": prices}






@api_router.post("/stocks/subscribe")
async def subscribe_stock(data: dict):
    instrument_key = data.get("instrument_key")

    if not instrument_key:
        return {"error": "instrument_key required"}

    await ws_manager.subscribe([instrument_key])

    return {"status": "subscribed", "instrument_key": instrument_key}




# ============= TRADING =============

@api_router.post("/trade", response_model=Order)
async def place_trade(trade: TradeRequest, current_user: dict = Depends(get_current_user)):
    """Place a buy or sell order"""
    # Get current price
    if trade.instrument_key not in ws_manager.price_cache:
        raise HTTPException(status_code=404, detail="Stock price not available")

    price = ws_manager.price_cache[trade.instrument_key]["last_price"]

    # Get contest config
    config = await db.contest_config.find_one() or {"trading_active": True}

    # Validate trade
    await validate_trade(trade, current_user, price, config.get("trading_active", True), db)

    # Execute trade
    order = await execute_trade(trade, current_user, price, db)

    return order

# ============= PORTFOLIO =============

@api_router.get("/portfolio", response_model=Portfolio)
async def get_portfolio(current_user: dict = Depends(get_current_user)):
    """Get user's portfolio"""
    user_id = current_user["sub"]

    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    cash_balance = user.get("virtual_balance", STARTING_CAPITAL)

    # Get holdings
    holdings_data = await db.portfolio.find({"user_id": user_id}).to_list(100)

    holdings = []
    invested_amount = 0
    current_value = cash_balance

    for h in holdings_data:
        instrument_key = h["instrument_key"]
        current_price = ws_manager.price_cache.get(instrument_key, {}).get("last_price", h["avg_price"])

        invested = h["avg_price"] * h["quantity"]
        value = current_price * h["quantity"]
        pnl = value - invested
        pnl_pct = (pnl / invested * 100) if invested > 0 else 0

        holding = Holding(
            instrument_key=instrument_key,
            trading_symbol=h["trading_symbol"],
            quantity=h["quantity"],
            avg_price=h["avg_price"],
            current_price=current_price,
            invested=invested,
            current_value=value,
            pnl=pnl,
            pnl_percentage=pnl_pct
        )
        holdings.append(holding)
        invested_amount += invested
        current_value += value

    total_pnl = current_value - STARTING_CAPITAL
    total_pnl_pct = (total_pnl / STARTING_CAPITAL * 100) if STARTING_CAPITAL > 0 else 0

    return Portfolio(
        user_id=user_id,
        holdings=holdings,
        cash_balance=cash_balance,
        invested_amount=invested_amount,
        current_value=current_value,
        total_pnl=total_pnl,
        total_pnl_percentage=total_pnl_pct
    )

# ============= ORDERS =============

@api_router.get("/orders")
async def get_orders(current_user: dict = Depends(get_current_user)):
    """Get user's order history"""
    user_id = current_user["sub"]
    orders = await db.orders.find({"user_id": user_id}).sort("timestamp", -1).to_list(100)

    for order in orders:
        order.pop('_id', None)

    return {"orders": orders}

# ============= LEADERBOARD =============

@api_router.get("/leaderboard", response_model=List[LeaderboardEntry])
async def get_leaderboard():
    """Get contest leaderboard"""
    users = await db.users.find({"role": UserRole.USER}).to_list(100)

    leaderboard_data = []

    for user in users:
        user_id = user["id"]
        cash_balance = user.get("virtual_balance", STARTING_CAPITAL)

        # Calculate portfolio value
        holdings = await db.portfolio.find({"user_id": user_id}).to_list(100)
        portfolio_value = cash_balance

        for h in holdings:
            instrument_key = h["instrument_key"]
            current_price = ws_manager.price_cache.get(instrument_key, {}).get("last_price", h["avg_price"])
            portfolio_value += current_price * h["quantity"]

        return_pct = ((portfolio_value - STARTING_CAPITAL) / STARTING_CAPITAL) * 100

        leaderboard_data.append({
            "username": user["username"],
            "portfolio_value": portfolio_value,
            "return_percentage": return_pct,
            "trade_count": user.get("trade_count", 0)
        })

    # Sort by return percentage (descending), then by trade count (ascending)
    leaderboard_data.sort(key=lambda x: (-x["return_percentage"], x["trade_count"]))

    # Add ranks
    result = []
    for idx, entry in enumerate(leaderboard_data, 1):
        result.append(LeaderboardEntry(
            rank=idx,
            username=entry["username"],
            portfolio_value=entry["portfolio_value"],
            return_percentage=entry["return_percentage"],
            trade_count=entry["trade_count"]
        ))

    return result

# ============= ADMIN ROUTES =============

def verify_admin(current_user: dict = Depends(get_current_user)):
    """Verify user is admin"""
    if current_user.get("role") != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

@api_router.get("/admin/users")
async def get_all_users(admin: dict = Depends(verify_admin)):
    """Get all users (admin only)"""
    users = await db.users.find({}, {"password": 0}).to_list(100)
    for user in users:
        user.pop('_id', None)
    return {"users": users}

@api_router.post("/admin/users")
async def create_user_admin(user_data: UserCreate, admin: dict = Depends(verify_admin)):
    """Create a new user (admin only)"""
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user_id = str(uuid.uuid4())
    user_dict = {
        "id": user_id,
        "username": user_data.username,
        "email": user_data.email,
        "password": get_password_hash(user_data.password),
        "role": user_data.role,
        "virtual_balance": STARTING_CAPITAL,
        "trade_count": 0,
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    await db.users.insert_one(user_dict)
    user_dict.pop('password')
    user_dict.pop('_id', None)
    return user_dict

@api_router.delete("/admin/users/{user_id}")
async def delete_user(user_id: str, admin: dict = Depends(verify_admin)):
    """Delete a user (admin only)"""
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")

    # Also delete user's portfolio and orders
    await db.portfolio.delete_many({"user_id": user_id})
    await db.orders.delete_many({"user_id": user_id})

    return {"message": "User deleted successfully"}

@api_router.get("/admin/upstox-auth-url")
async def get_upstox_auth_url(admin: dict = Depends(verify_admin)):
    """Return the Upstox OAuth URL for admin to click"""
    if not UPSTOX_CLIENT_ID or not UPSTOX_REDIRECT_URI:
        raise HTTPException(status_code=500, detail="UPSTOX_CLIENT_ID or UPSTOX_REDIRECT_URI not configured in backend env")
    
    auth_url = (
        f"https://api.upstox.com/v2/login/authorization/dialog"
        f"?response_type=code"
        f"&client_id={UPSTOX_CLIENT_ID}"
        f"&redirect_uri={UPSTOX_REDIRECT_URI}"
    )
    return {"auth_url": auth_url}


@api_router.get("/admin/upstox-status")
async def upstox_status(admin: dict = Depends(verify_admin)):
    """Get Upstox token and WebSocket connection status"""
    config = await db.app_settings.find_one({"key": "upstox_token"})

    if not config or not config.get("access_token"):
        return {
            "status": "missing",
            "ws_connected": False,
            "subscribed_instruments": 0,
            "token_updated_at": None,
            "message": "No Upstox token found. Click 'Refresh Upstox Token' to login."
        }

    updated_at = config.get("updated_at")

    return {
        "status": "connected" if ws_manager.upstox_connected else "disconnected",
        "ws_connected": ws_manager.upstox_connected,
        "subscribed_instruments": len(ws_manager.subscribed_instruments),
        "token_updated_at": str(updated_at) if updated_at else None,
        "message": (
            f"Live feed active — {len(ws_manager.subscribed_instruments)} instruments streaming."
            if ws_manager.upstox_connected
            else "Token exists but WebSocket is disconnected. It will auto-reconnect, or refresh the token if it expired."
        )
    }

@api_router.get("/admin/contest")
async def get_contest_config(admin: dict = Depends(verify_admin)):
    """Get contest configuration (admin only)"""
    config = await db.contest_config.find_one()
    if config:
        config.pop('_id', None)
        return config
    return {"trading_active": True}

@api_router.put("/admin/contest")
async def update_contest_config(config: ContestConfig, admin: dict = Depends(verify_admin)):
    """Update contest configuration (admin only)"""
    config_dict = config.model_dump()
    config_dict["start_time"] = config_dict["start_time"].isoformat()
    config_dict["end_time"] = config_dict["end_time"].isoformat()

    await db.contest_config.delete_many({})
    await db.contest_config.insert_one(config_dict)

    config_dict.pop('_id', None)
    return config_dict

@api_router.post("/admin/contest/freeze")
async def freeze_trading(admin: dict = Depends(verify_admin)):
    """Freeze trading (admin only)"""
    await db.contest_config.update_one(
        {},
        {"$set": {"trading_active": False}},
        upsert=True
    )
    return {"message": "Trading frozen"}

@api_router.post("/admin/contest/unfreeze")
async def unfreeze_trading(admin: dict = Depends(verify_admin)):
    """Unfreeze trading (admin only)"""
    await db.contest_config.update_one(
        {},
        {"$set": {"trading_active": True}},
        upsert=True
    )
    return {"message": "Trading unfrozen"}

# Include router
app.include_router(api_router)

@app.api_route("/health", methods=["GET", "HEAD"])
async def health_check():
    return {"status": "healthy", "service": "campus-trading-platform"}