from models import TradeRequest, TradeType, Order
from market_timing import is_market_open
from fastapi import HTTPException
from datetime import datetime, timezone
import uuid

STARTING_CAPITAL = 1000000
MAX_SINGLE_STOCK_ALLOCATION = 0.5

async def validate_trade(trade: TradeRequest, user_data: dict, price: float, contest_active: bool, db) -> dict:
    """Validate trade before execution"""
    
    # Check if contest is active and market is open
    is_open, message = is_market_open(contest_active)
    if not is_open:
        raise HTTPException(status_code=400, detail=message)
    
    user_id = user_data['id']
    
    # Get user's current balance and portfolio
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    balance = user.get('virtual_balance', STARTING_CAPITAL)
    
    if trade.trade_type == TradeType.BUY:
        total_cost = price * trade.quantity
        
        # Check sufficient balance
        if balance < total_cost:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient balance. Required: ₹{total_cost:,.2f}, Available: ₹{balance:,.2f}"
            )
        
        # Check 50% capital allocation rule
        max_investment = STARTING_CAPITAL * MAX_SINGLE_STOCK_ALLOCATION
        
        # Get current holding for this stock
        holding = await db.portfolio.find_one({
            "user_id": user_id,
            "instrument_key": trade.instrument_key
        })
        
        current_investment = 0
        if holding:
            current_investment = holding.get('avg_price', 0) * holding.get('quantity', 0)
        
        total_investment = current_investment + total_cost
        
        if total_investment > max_investment:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot invest more than 50% of capital in a single stock. Max allowed: ₹{max_investment:,.2f}"
            )
        
        return {
            "valid": True,
            "total_amount": total_cost,
            "new_balance": balance - total_cost
        }
    
    else:  # SELL
        # Check if user owns this stock
        holding = await db.portfolio.find_one({
            "user_id": user_id,
            "instrument_key": trade.instrument_key
        })
        
        if not holding:
            raise HTTPException(
                status_code=400,
                detail=f"You don't own {trade.trading_symbol}"
            )
        
        current_quantity = holding.get('quantity', 0)
        
        if current_quantity < trade.quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient quantity. You own {current_quantity} shares, trying to sell {trade.quantity}"
            )
        
        total_proceeds = price * trade.quantity
        
        return {
            "valid": True,
            "total_amount": total_proceeds,
            "new_balance": balance + total_proceeds
        }

async def execute_trade(trade: TradeRequest, user_data: dict, price: float, db) -> Order:
    """Execute a validated trade"""
    
    user_id = user_data['id']
    order_id = str(uuid.uuid4())
    timestamp = datetime.now(timezone.utc)
    
    if trade.trade_type == TradeType.BUY:
        total_amount = price * trade.quantity
        
        # Update user balance
        await db.users.update_one(
            {"id": user_id},
            {
                "$inc": {
                    "virtual_balance": -total_amount,
                    "trade_count": 1
                }
            }
        )
        
        # Update portfolio
        holding = await db.portfolio.find_one({
            "user_id": user_id,
            "instrument_key": trade.instrument_key
        })
        
        if holding:
            # Update existing holding
            old_qty = holding.get('quantity', 0)
            old_avg = holding.get('avg_price', 0)
            new_qty = old_qty + trade.quantity
            new_avg = ((old_avg * old_qty) + (price * trade.quantity)) / new_qty
            
            await db.portfolio.update_one(
                {"user_id": user_id, "instrument_key": trade.instrument_key},
                {"$set": {"quantity": new_qty, "avg_price": new_avg}}
            )
        else:
            # Create new holding
            await db.portfolio.insert_one({
                "user_id": user_id,
                "instrument_key": trade.instrument_key,
                "trading_symbol": trade.trading_symbol,
                "quantity": trade.quantity,
                "avg_price": price
            })
    
    else:  # SELL
        total_amount = price * trade.quantity
        
        # Update user balance
        await db.users.update_one(
            {"id": user_id},
            {
                "$inc": {
                    "virtual_balance": total_amount,
                    "trade_count": 1
                }
            }
        )
        
        # Update portfolio
        holding = await db.portfolio.find_one({
            "user_id": user_id,
            "instrument_key": trade.instrument_key
        })
        
        new_qty = holding['quantity'] - trade.quantity
        
        if new_qty == 0:
            # Remove holding completely
            await db.portfolio.delete_one({
                "user_id": user_id,
                "instrument_key": trade.instrument_key
            })
        else:
            # Update quantity
            await db.portfolio.update_one(
                {"user_id": user_id, "instrument_key": trade.instrument_key},
                {"$set": {"quantity": new_qty}}
            )
    
    # Record order
    order = Order(
        id=order_id,
        user_id=user_id,
        instrument_key=trade.instrument_key,
        trading_symbol=trade.trading_symbol,
        trade_type=trade.trade_type,
        quantity=trade.quantity,
        price=price,
        total_amount=total_amount,
        timestamp=timestamp
    )
    
    await db.orders.insert_one(order.model_dump())
    
    return order