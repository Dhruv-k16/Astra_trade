import asyncio
import json
import os
import logging
import aiohttp
from typing import Set, Dict
from datetime import datetime, timezone
from marketdata_pb2 import FeedResponse
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
        """Add instruments to subscription set and send to Upstox if connected."""
        new_keys = []

        for key in instrument_keys:
            if key not in self.subscribed_instruments:
                self.subscribed_instruments.add(key)
                new_keys.append(key)

        # FIX: Only call _send_subscription once, only if connected
        if new_keys and self.ws and self.upstox_connected:
            await self._send_subscription(new_keys)
        elif new_keys:
            logger.info(f"Queued {len(new_keys)} instruments (Upstox not yet connected)")

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
            except Exception:
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
            except Exception:
                pass

    # ---------------- UPSTOX FEED ---------------- #

    async def connect_upstox_feed(self):
        """Maintains persistent connection to Upstox V3 WebSocket with auto-reconnect."""
        while True:
            try:
                config = await db.app_settings.find_one({"key": "upstox_token"})

                if not config or not config.get("access_token"):
                    logger.warning("Upstox access token not found. Waiting 30s...")
                    await asyncio.sleep(30)
                    continue

                access_token = config["access_token"]
                logger.info("Authorizing Upstox V3 WebSocket...")

                # STEP A — Authorize and get WebSocket URL
                async with aiohttp.ClientSession() as session:
                    async with session.get(
                        "https://api.upstox.com/v3/feed/market-data-feed/authorize",
                        headers={
                            "Authorization": f"Bearer {access_token}",
                            "Accept": "application/json"
                        }
                    ) as response:
                        if response.status == 401:
                            logger.error("Upstox token expired (401). Waiting for re-auth...")
                            await self.broadcast_status("error", "Market feed auth expired. Please re-login with Upstox.")
                            await asyncio.sleep(60)
                            continue

                        if response.status != 200:
                            raise Exception(f"Authorization failed: {response.status}")

                        data = await response.json()
                        ws_url = data["data"]["authorized_redirect_uri"]

                logger.info(f"Connecting to V3 WebSocket: {ws_url}")

                # STEP B — Connect to WebSocket
                async with websockets.connect(
                    ws_url,
                    ping_interval=20,   # send ping every 20s to keep connection alive
                    ping_timeout=30,    # wait 30s for pong before declaring dead
                    close_timeout=10
                ) as websocket:
                    self.ws = websocket
                    self.upstox_connected = True
                    logger.info("✅ Upstox V3 WebSocket connected")

                    await self.broadcast_status("connected", "Connected to live NSE market")

                    # Send queued subscriptions immediately on (re)connect
                    if self.subscribed_instruments:
                        await self._send_subscription(list(self.subscribed_instruments))

                    # STEP C — Receive binary messages
                    async for message in websocket:
                        if isinstance(message, bytes):
                            await self._handle_upstox_binary(message)
                        else:
                            logger.debug(f"Text message from Upstox: {message}")

            except websockets.exceptions.ConnectionClosedError as e:
                logger.warning(f"Upstox WebSocket closed: {e}. Reconnecting in 5s...")
            except Exception as e:
                logger.error(f"Upstox connection error: {e}", exc_info=True)

            # Cleanup state on disconnect
            self.upstox_connected = False
            self.ws = None
            await self.broadcast_status("disconnected", "Market feed disconnected - retrying...")
            await asyncio.sleep(5)

    async def _send_subscription(self, instrument_keys: list = None):
        """Send subscription payload to Upstox V3 WebSocket."""
        if not self.ws or not self.upstox_connected:
            logger.warning("Cannot subscribe: Upstox not connected")
            return

        if instrument_keys is None:
            instrument_keys = list(self.subscribed_instruments)

        if not instrument_keys:
            return

        # Upstox V3 exact payload format
        payload = {
            "guid": str(datetime.now(timezone.utc).timestamp()),
            "method": "sub",
            "data": {
                "mode": "ltpc",   # ltpc = LTP + Close price. Change to "full" for OHLCV + depth
                "instrumentKeys": instrument_keys
            }
        }

        await self.ws.send(json.dumps(payload))
        logger.info(f"📡 Subscribed to {len(instrument_keys)} instruments: {instrument_keys[:3]}{'...' if len(instrument_keys) > 3 else ''}")

    async def _handle_upstox_binary(self, message: bytes):
        """Decode Upstox protobuf binary and broadcast price updates."""
        try:
            feed_response = FeedResponse()
            feed_response.ParseFromString(message)

            for instrument_key, feed in feed_response.feeds.items():
                ltp = None
                volume = 0
                close_price = None  # cp = previous day's closing price from Upstox

                if feed.HasField("ltpc"):
                    ltp = feed.ltpc.ltp
                    volume = getattr(feed.ltpc, 'ltq', 0)
                    close_price = getattr(feed.ltpc, 'cp', None)

                elif feed.HasField("fullFeed"):
                    ff = feed.fullFeed
                    if hasattr(ff, 'marketFF') and ff.marketFF.HasField('ltpc'):
                        ltp = ff.marketFF.ltpc.ltp
                        volume = getattr(ff.marketFF.ltpc, 'ltq', 0)
                        close_price = getattr(ff.marketFF.ltpc, 'cp', None)
                    else:
                        continue
                else:
                    continue

                if ltp is None:
                    continue

                # FIX: Calculate change vs previous day's close (cp), not vs cached price
                change_percent = 0.0
                if close_price and close_price != 0:
                    change_percent = round(((ltp - close_price) / close_price) * 100, 2)
                else:
                    # Fallback: use first-seen price as reference
                    open_price_ref = self.price_cache.get(instrument_key, {}).get("open_price")
                    if open_price_ref and open_price_ref != 0:
                        change_percent = round(((ltp - open_price_ref) / open_price_ref) * 100, 2)

                # Track open_price (first price we ever saw for this instrument in this session)
                is_first = instrument_key not in self.price_cache
                open_price = ltp if is_first else self.price_cache[instrument_key].get("open_price", ltp)

                price_update = {
                    "last_price": ltp,
                    "volume": volume,
                    "close_price": close_price,
                    "open_price": open_price,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "change_percent": change_percent
                }

                logger.debug(f"Price update: {instrument_key} = ₹{ltp} ({change_percent:+.2f}%)")
                await self.broadcast_price_update(instrument_key, price_update)

        except Exception as e:
            logger.error(f"Error processing Upstox binary message: {e}", exc_info=True)


ws_manager = PriceWebSocketManager()