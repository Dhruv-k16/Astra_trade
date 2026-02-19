import asyncio
import json
import random
from typing import Set, Dict
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)

class PriceWebSocketManager:
    def __init__(self):
        self.active_connections: list = []
        self.subscribed_instruments: Set[str] = set()
        self.price_cache: Dict[str, dict] = {}
        self.upstox_connected = False
        self.reconnect_task = None
        
    async def connect(self, websocket):
        """Accept a new WebSocket connection from frontend"""
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"New WebSocket connection. Total: {len(self.active_connections)}")
        
    def disconnect(self, websocket):
        """Remove a WebSocket connection"""
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"WebSocket disconnected. Total: {len(self.active_connections)}")
    
    async def subscribe(self, instrument_keys: list):
        """Subscribe to instruments for price updates"""
        for key in instrument_keys:
            if key not in self.subscribed_instruments:
                self.subscribed_instruments.add(key)
                logger.info(f"Subscribed to {key}")
    
    async def unsubscribe(self, instrument_keys: list):
        """Unsubscribe from instruments"""
        for key in instrument_keys:
            if key in self.subscribed_instruments:
                self.subscribed_instruments.discard(key)
                logger.info(f"Unsubscribed from {key}")
    
    async def broadcast_price_update(self, instrument_key: str, price_data: dict):
        """Broadcast price update to all connected clients"""
        message = {
            "type": "price_update",
            "instrument_key": instrument_key,
            "data": price_data
        }
        
        # Update cache
        self.price_cache[instrument_key] = price_data
        
        # Broadcast to all clients
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Error sending to client: {e}")
                disconnected.append(connection)
        
        # Clean up disconnected clients
        for conn in disconnected:
            self.disconnect(conn)
    
    async def broadcast_status(self, status: str, message: str):
        """Broadcast connection status to all clients"""
        status_message = {
            "type": "status",
            "status": status,
            "message": message
        }
        
        for connection in self.active_connections:
            try:
                await connection.send_json(status_message)
            except:
                pass
    
    async def simulate_upstox_feed(self):
        """Simulate Upstox WebSocket feed with realistic price movements"""
        logger.info("Starting simulated Upstox WebSocket feed")
        
        # Base prices for sample stocks
        base_prices = {
            "NSE_EQ|INE002A01018": 2450.75,  # RELIANCE
            "NSE_EQ|INE467B01029": 3850.20,  # TCS
            "NSE_EQ|INE040A01034": 1550.60,  # INFY
            "NSE_EQ|INE009A01021": 1680.40,  # HDFCBANK
            "NSE_EQ|INE090A01021": 1245.80,  # ICICIBANK
            "NSE_EQ|INE018A01030": 485.30,   # WIPRO
            "NSE_EQ|INE155A01022": 920.15,   # TATAMOTORS
            "NSE_EQ|INE437A01024": 6850.50,  # APOLLOHOSP
        }
        
        # Initialize cache
        for key, price in base_prices.items():
            self.price_cache[key] = {
                "last_price": price,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "change_percent": 0.0
            }
        
        self.upstox_connected = True
        await self.broadcast_status("connected", "Live market data connected")
        
        while True:
            try:
                # Update prices for subscribed instruments only
                for instrument_key in list(self.subscribed_instruments):
                    if instrument_key in self.price_cache:
                        current_data = self.price_cache[instrument_key]
                        current_price = current_data["last_price"]
                        
                        # Realistic price movement (-0.5% to +0.5%)
                        change_percent = random.uniform(-0.005, 0.005)
                        new_price = current_price * (1 + change_percent)
                        
                        price_update = {
                            "last_price": round(new_price, 2),
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "change_percent": round(change_percent * 100, 2),
                            "volume": random.randint(1000, 50000)
                        }
                        
                        # Broadcast to all connected clients
                        await self.broadcast_price_update(instrument_key, price_update)
                
                # Wait 1-2 seconds between updates (realistic feed speed)
                await asyncio.sleep(random.uniform(1.0, 2.0))
                
            except Exception as e:
                logger.error(f"Error in price feed: {e}")
                self.upstox_connected = False
                await self.broadcast_status("disconnected", "Live connection lost - reconnecting...")
                await asyncio.sleep(5)
                self.upstox_connected = True
                await self.broadcast_status("connected", "Reconnected to live market data")

# Global WebSocket manager instance
ws_manager = PriceWebSocketManager()