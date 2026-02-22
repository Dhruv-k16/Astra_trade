import json
import os
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()
# Use environment variable for safety
MONGO_URL = os.getenv("MONGO_URL")

if not MONGO_URL:
    raise Exception("MONGO_URL not set")

client = MongoClient(MONGO_URL)
db = client["astra_trade"]

# Load JSON
with open("data/complete.json", "r") as f:
    instruments = json.load(f)

bulk = []

for item in instruments:

    segment = item.get("segment")

    # Only load equity for now (safe + fast)
    if segment in ["NSE_EQ", "BSE_EQ"]:

        bulk.append({
            "symbol": item.get("trading_symbol"),
            "name": item.get("name"),
            "instrument_key": item.get("instrument_key"),
            "exchange": segment.split("_")[0],   # NSE or BSE
            "segment": segment
        })

# Clear and insert fresh
db.instruments.delete_many({})
if bulk:
    db.instruments.insert_many(bulk)

print("Inserted:", len(bulk))