from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum

class UserRole(str, Enum):
    ADMIN = "admin"
    USER = "user"

class TradeType(str, Enum):
    BUY = "BUY"
    SELL = "SELL"

class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=6)
    role: UserRole = UserRole.USER

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class User(BaseModel):
    id: str
    username: str
    email: EmailStr
    role: UserRole
    virtual_balance: float
    trade_count: int
    created_at: datetime

class Token(BaseModel):
    access_token: str
    token_type: str
    user: User

class Instrument(BaseModel):
    instrument_key: str
    trading_symbol: str
    name: str
    segment: str
    exchange: str
    instrument_type: str

class StockPrice(BaseModel):
    instrument_key: str
    last_price: float
    timestamp: datetime

class TradeRequest(BaseModel):
    instrument_key: str
    trading_symbol: str
    quantity: int = Field(..., gt=0)
    trade_type: TradeType

class Order(BaseModel):
    id: str
    user_id: str
    instrument_key: str
    trading_symbol: str
    trade_type: TradeType
    quantity: int
    price: float
    total_amount: float
    timestamp: datetime

class Holding(BaseModel):
    instrument_key: str
    trading_symbol: str
    quantity: int
    avg_price: float
    current_price: float
    invested: float
    current_value: float
    pnl: float
    pnl_percentage: float

class Portfolio(BaseModel):
    user_id: str
    holdings: List[Holding]
    cash_balance: float
    invested_amount: float
    current_value: float
    total_pnl: float
    total_pnl_percentage: float

class LeaderboardEntry(BaseModel):
    rank: int
    username: str
    portfolio_value: float
    return_percentage: float
    trade_count: int

class ContestConfig(BaseModel):
    start_time: datetime
    end_time: datetime
    trading_active: bool
    market_open_time: str = "09:15"
    market_close_time: str = "15:30"

class MarketStatus(BaseModel):
    is_open: bool
    current_time: str
    message: str