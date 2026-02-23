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
                    msg_count = 0
                    async for message in websocket:
                        msg_count += 1
                        if isinstance(message, bytes):
                            logger.info(f"📦 Binary msg #{msg_count}: {len(message)} bytes")
                            await self._handle_upstox_binary(message)
                        else:
                            logger.info(f"📝 Text msg #{msg_count}: {message[:200]}")

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

        # Upstox V3 REQUIRES subscription sent as binary, not text
        await self.ws.send(json.dumps(payload).encode('utf-8'))
        logger.info(f"📡 Subscribed to {len(instrument_keys)} instruments: {instrument_keys[:3]}{'...' if len(instrument_keys) > 3 else ''}")

    async def _handle_upstox_binary(self, message: bytes):
        """Decode Upstox V3 message — tries JSON first, then protobuf."""
        try:
            # Upstox V3 sends JSON-encoded bytes (not raw protobuf)
            text = message.decode('utf-8')
            data = json.loads(text)

            msg_type = data.get("type", "")

            # First tick: market status info — just log it
            if msg_type == "market_info":
                segment_status = data.get("marketInfo", {}).get("segmentStatus", {})
                nse_eq = segment_status.get("NSE_EQ", "UNKNOWN")
                logger.info(f"📊 Market status — NSE_EQ: {nse_eq}")
                await self.broadcast_status(
                    "connected",
                    f"Market status: NSE_EQ {nse_eq}"
                )
                return

            # Second + subsequent ticks: live feed data
            if msg_type == "live_feed":
                feeds = data.get("feeds", {})
                logger.info(f"📈 Live feed tick — {len(feeds)} instruments")

                for instrument_key, feed_data in feeds.items():
                    ltpc = feed_data.get("ltpc", {})
                    if not ltpc:
                        continue

                    ltp = ltpc.get("ltp")
                    if ltp is None:
                        continue

                    close_price = ltpc.get("cp")
                    volume = int(ltpc.get("ltq", 0) or 0)

                    # Change % vs previous day close price
                    change_percent = 0.0
                    if close_price and close_price != 0:
                        change_percent = round(((ltp - close_price) / close_price) * 100, 2)

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

                    logger.info(f"💰 {instrument_key} = ₹{ltp} ({change_percent:+.2f}%)")
                    await self.broadcast_price_update(instrument_key, price_update)
                return

            logger.info(f"📨 Unknown message type: {msg_type} — {text[:200]}")

        except (UnicodeDecodeError, json.JSONDecodeError):
            # Fallback: try protobuf parsing for older format
            try:
                feed_response = FeedResponse()
                feed_response.ParseFromString(message)

                for instrument_key, feed in feed_response.feeds.items():
                    ltp = None
                    volume = 0
                    close_price = None

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

                    if ltp is None:
                        continue

                    change_percent = 0.0
                    if close_price and close_price != 0:
                        change_percent = round(((ltp - close_price) / close_price) * 100, 2)

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

                    logger.info(f"💰 [protobuf] {instrument_key} = ₹{ltp}")
                    await self.broadcast_price_update(instrument_key, price_update)

            except Exception as e:
                logger.error(f"Protobuf parse error: {e}", exc_info=True)

        except Exception as e:
            logger.error(f"Error processing Upstox message: {e}", exc_info=True)


ws_manager = PriceWebSocketManager()