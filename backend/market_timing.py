from datetime import datetime
import pytz
from models import MarketStatus

IST = pytz.timezone('Asia/Kolkata')

def get_current_ist_time():
    """Get current time in IST"""
    return datetime.now(IST)

def is_market_open(contest_active: bool = True) -> tuple[bool, str]:
    """Check if market is open for trading"""
    if not contest_active:
        return False, "Contest is not active"
    
    now = get_current_ist_time()
    current_time = now.time()
    
    # Market hours: 9:15 AM - 3:30:30 PM IST
    market_open = now.replace(hour=9, minute=15, second=0, microsecond=0).time()
    market_close = now.replace(hour=15, minute=30, second=30, microsecond=0).time()
    
    # Check if it's a weekday (Monday=0, Sunday=6)
    if now.weekday() >= 5:  # Saturday or Sunday
        return False, "Market closed on weekends"
    
    if current_time < market_open:
        return False, f"Market opens at 9:15 AM IST. Current time: {now.strftime('%I:%M %p IST')}"
    elif current_time > market_close:
        return False, f"Market closed at 3:30 PM IST. Current time: {now.strftime('%I:%M %p IST')}"
    else:
        return True, f"Market is open. Current time: {now.strftime('%I:%M %p IST')}"

def get_market_status(contest_active: bool = True) -> MarketStatus:
    """Get current market status"""
    is_open, message = is_market_open(contest_active)
    now = get_current_ist_time()
    
    return MarketStatus(
        is_open=is_open,
        current_time=now.strftime('%I:%M %p IST'),
        message=message
    )