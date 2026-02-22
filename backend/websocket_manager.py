import asyncio
import json
import os
import logging
import aiohttp
from typing import Set, Dict
from datetime import datetime, timezone

import websockets
from motor.motor_asyncio import AsyncIOMotorClient

logger = logging.getLogger(__name__)

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]


class PriceWebSocketManager:
    def __init__(self):
        self.active_connections: list = []
        self.subscribed_instruments: Set[str] = set()
        self.price_cache: Dict[str, dict] = {}
        self.upstox_connected = False
        self.ws = None

    # ---------------- FRONTEND ---------------- #

    async def connect(self, websocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"Frontend connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"Frontend disconnected. Total: {len(self.active_connections)}")

    async def subscribe(self, instrument_keys: list):
        for key in instrument_keys:
            self.subscribed_instruments.add(key)

        if self.ws and self.upstox_connected:
            await self._send_subscription()

    async def unsubscribe(self, instrument_keys: list):
        for key in instrument_keys:
            self.subscribed_instruments.discard(key)

    # ---------------- BROADCAST ---------------- #

    async def broadcast_price_update(self, instrument_key: str, price_data: dict):
        self.price_cache[instrument_key] = price_data

        message = {
            "type": "price_update",
            "instrument_key": instrument_key,
            "data": price_data
        }

        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                disconnected.append(connection)

        for conn in disconnected:
            self.disconnect(conn)

    async def broadcast_status(self, status: str, message: str):
        payload = {
            "type": "status",
            "status": status,
            "message": message
        }

        for connection in self.active_connections:
            try:
                await connection.send_json(payload)
            except:
                pass

    # ---------------- UPSTOX FEED ---------------- #

    async def connect_upstox_feed(self):
        while True:
            try:
                config = await db.app_settings.find_one({"key": "upstox_token"})

                if not config or not config.get("access_token"):
                    logger.warning("Upstox access token not found. Waiting...")
                    await asyncio.sleep(5)
                    continue

                access_token = config["access_token"]

                logger.info("Authorizing Upstox V3 WebSocket...")

                # Step 1: Get authorized WebSocket URL
                async with aiohttp.ClientSession() as session:
                    async with session.get(
                        "https://api.upstox.com/v3/feed/market-data-feed/authorize",
                        headers={
                            "Authorization": f"Bearer {access_token}"
                        }
                    ) as response:

                        if response.status != 200:
                            logger.error(f"Authorization failed: {response.status}")
                            await asyncio.sleep(5)
                            continue

                        auth_data = await response.json()
                        ws_url = auth_data["data"]["authorized_redirect_uri"]

                logger.info(f"Connecting to V3 WebSocket: {ws_url}")

                # Step 2: Connect to returned WebSocket URL
                async with websockets.connect(
                    ws_url,
                    ping_interval=20,
                    ping_timeout=20
                ) as websocket:

                    self.ws = websocket
                    self.upstox_connected = True

                    await self.broadcast_status(
                        "connected",
                        "Connected to Upstox V3 market feed"
                    )

                    await self._send_subscription()

                    while True:
                        message = await websocket.recv()
                        await self._handle_upstox_message(message)

            except Exception as e:
                logger.error(f"Upstox connection error: {e}")
                self.upstox_connected = False
                await self.broadcast_status(
                    "disconnected",
                    "Market feed disconnected - retrying..."
                )
                await asyncio.sleep(5)



    async def _send_subscription(self):
        if not self.subscribed_instruments:
            return

        payload = {
            "guid": "campus-trade-feed",
            "method": "subscribe",
            "data": {
                "mode": "full",
                "instrumentKeys": list(self.subscribed_instruments)
            }
        }

        await self.ws.send(json.dumps(payload))
        logger.info(f"Subscribed to {len(self.subscribed_instruments)} instruments")

    async def _handle_upstox_message(self, raw_message):
        try:
            data = json.loads(raw_message)

            if "data" not in data:
                return

            for item in data["data"]:
                instrument_key = item.get("instrumentKey")
                ltp_data = item.get("ltp")

                if instrument_key and ltp_data:
                    price_update = {
                        "last_price": ltp_data.get("ltp"),
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "volume": ltp_data.get("volume", 0),
                        "change_percent": ltp_data.get("percentChange", 0)
                    }

                    await self.broadcast_price_update(instrument_key, price_update)

        except Exception as e:
            logger.error(f"Error processing Upstox message: {e}")


ws_manager = PriceWebSocketManager()