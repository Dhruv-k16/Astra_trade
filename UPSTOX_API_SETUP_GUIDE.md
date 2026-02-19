# Upstox API Setup Guide for Campus Trading Platform

## Overview
This guide will help you integrate real Upstox API for live NSE market data. Currently, the platform uses sample stock data with simulated price updates.

## Prerequisites
- Upstox trading account (create at [upstox.com](https://upstox.com))
- Completed KYC verification
- Basic understanding of OAuth 2.0

## Step 1: Create Upstox Developer App

1. Visit [Upstox Developer Portal](https://upstox.com/developer/apps)
2. Login with your Upstox credentials
3. Click **"Create App"**
4. Fill in the app details:
   - **App Name**: Campus Trading Platform
   - **Redirect URI**: `http://localhost:8000/api/upstox/callback` (for local development)
   - For production: `https://your-domain.com/api/upstox/callback`
5. Note down your:
   - **Client ID** (API Key)
   - **Client Secret**

## Step 2: Configure Environment Variables

Add the following to `/app/backend/.env`:

```env
UPSTOX_CLIENT_ID=your_client_id_here
UPSTOX_CLIENT_SECRET=your_client_secret_here
UPSTOX_REDIRECT_URI=http://localhost:8000/api/upstox/callback
```

## Step 3: Install Upstox SDK (Optional)

The platform currently uses direct HTTP calls to Upstox API. If you want to use the official SDK:

```bash
cd /app/backend
pip install upstox-python-sdk
pip freeze > requirements.txt
```

## Step 4: Implement Upstox Integration

Create `/app/backend/upstox_service.py`:

```python
import aiohttp
import os
from datetime import datetime, timezone

class UpstoxService:
    BASE_URL = "https://api.upstox.com/v2"
    
    def __init__(self):
        self.client_id = os.environ['UPSTOX_CLIENT_ID']
        self.client_secret = os.environ['UPSTOX_CLIENT_SECRET']
        self.redirect_uri = os.environ['UPSTOX_REDIRECT_URI']
        self.access_token = None
    
    def get_login_url(self):
        """Generate OAuth login URL"""
        return (
            f"https://api.upstox.com/v2/login/authorization/dialog?"
            f"client_id={self.client_id}&"
            f"redirect_uri={self.redirect_uri}&"
            f"response_type=code"
        )
    
    async def exchange_code_for_token(self, code: str):
        """Exchange authorization code for access token"""
        async with aiohttp.ClientSession() as session:
            url = f"{self.BASE_URL}/login/authorization/token"
            payload = {
                "code": code,
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "redirect_uri": self.redirect_uri,
                "grant_type": "authorization_code"
            }
            
            async with session.post(url, json=payload) as response:
                if response.status == 200:
                    data = await response.json()
                    self.access_token = data["access_token"]
                    return data
                else:
                    raise Exception(f"Token exchange failed: {await response.text()}")
    
    async def download_instruments(self, segment="NSE_EQ"):
        """Download instrument master list"""
        import gzip
        import json
        
        url = f"https://assets.upstox.com/market-quote/instruments/exchange/{segment}.json.gz"
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as response:
                if response.status == 200:
                    content = await response.read()
                    decompressed = gzip.decompress(content)
                    return json.loads(decompressed)
                else:
                    raise Exception(f"Failed to download instruments: {response.status}")
    
    async def get_live_prices(self, instrument_keys: list):
        """Fetch live prices for multiple instruments"""
        if not self.access_token:
            raise Exception("Access token not set. Please authenticate first.")
        
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Accept": "application/json"
        }
        
        # Upstox allows max 500 instruments per request
        instrument_str = ",".join(instrument_keys[:500])
        url = f"{self.BASE_URL}/market-quote/ltp?instrument_key={instrument_str}"
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get("data", {})
                else:
                    raise Exception(f"Failed to fetch prices: {await response.text()}")
```

## Step 5: Add OAuth Endpoints

Add to `/app/backend/server.py`:

```python
from upstox_service import UpstoxService

upstox_service = UpstoxService()

@api_router.get("/upstox/login")
async def upstox_login(admin: dict = Depends(verify_admin)):
    """Initiate Upstox OAuth login (admin only)"""
    login_url = upstox_service.get_login_url()
    return {"login_url": login_url}

@api_router.get("/upstox/callback")
async def upstox_callback(code: str):
    """Handle Upstox OAuth callback"""
    try:
        token_data = await upstox_service.exchange_code_for_token(code)
        # Store token in database or secure storage
        await db.upstox_tokens.insert_one({
            "access_token": token_data["access_token"],
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        return {"message": "Authentication successful"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.post("/upstox/sync-instruments")
async def sync_instruments(admin: dict = Depends(verify_admin)):
    """Download and sync instrument master (admin only)"""
    try:
        instruments = await upstox_service.download_instruments("NSE_EQ")
        
        # Clear old instruments
        await db.instruments.delete_many({})
        
        # Insert new instruments
        if instruments:
            await db.instruments.insert_many(instruments)
        
        return {"message": f"Synced {len(instruments)} instruments"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

## Step 6: Update Price Polling

Replace the `update_sample_prices()` function in `server.py`:

```python
async def update_live_prices():
    """Update prices from Upstox API"""
    try:
        # Get access token from database
        token_doc = await db.upstox_tokens.find_one()
        if not token_doc:
            logger.warning("No Upstox access token found")
            return
        
        upstox_service.access_token = token_doc["access_token"]
        
        # Get all instruments that need price updates
        # (from user portfolios and recent searches)
        active_instruments = set()
        
        portfolios = await db.portfolio.find().to_list(1000)
        for portfolio in portfolios:
            active_instruments.add(portfolio["instrument_key"])
        
        if not active_instruments:
            return
        
        # Fetch live prices
        prices = await upstox_service.get_live_prices(list(active_instruments))
        
        # Update price cache
        for instrument_key, price_data in prices.items():
            price_cache[instrument_key] = {
                "last_price": price_data.get("last_price"),
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
        
        logger.info(f"Updated {len(prices)} live prices")
        
    except Exception as e:
        logger.error(f"Price update error: {str(e)}")
```

## Step 7: Authentication Flow

### Daily Token Renewal

**Important**: Upstox tokens expire daily at 3:30 AM UTC. You need to re-authenticate every day.

Admin workflow:
1. Admin logs into the platform
2. Goes to Admin Dashboard
3. Clicks "Connect Upstox" button
4. Completes OAuth flow
5. Token is stored and used for the day

## Step 8: Rate Limiting

Upstox has a rate limit of **25 requests per second**. The platform's price polling (every 15 seconds) stays well within limits.

To handle rate limits:
- Use batch requests (up to 500 instruments)
- Implement exponential backoff on failures
- Cache prices aggressively

## Step 9: Testing

1. **Test OAuth Flow**:
   ```bash
   curl http://localhost:8000/api/upstox/login
   # Visit the returned URL in browser
   ```

2. **Test Instrument Sync**:
   ```bash
   curl -X POST http://localhost:8000/api/upstox/sync-instruments \
     -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
   ```

3. **Verify Price Updates**:
   Check logs:
   ```bash
   tail -f /var/log/supervisor/backend.out.log
   ```

## Current Implementation

The platform currently uses:
- **Sample stock data**: 8 popular NSE stocks (RELIANCE, TCS, INFY, etc.)
- **Simulated prices**: Random price movements between -1% to +1% every 15 seconds
- **No real API calls**: Fully functional without Upstox credentials

This allows you to:
- Test the complete trading flow
- Demo the platform to participants
- Later switch to real data when ready

## Important Notes

1. **Token Management**: Upstox tokens expire at 3:30 AM UTC daily. Implement automatic logout or re-authentication prompts.

2. **Market Hours**: The platform enforces Indian market hours (9:15 AM - 3:30 PM IST). Ensure server timezone is set correctly.

3. **No Refresh Tokens**: Upstox doesn't support refresh tokens, requiring daily manual re-authentication.

4. **Testing Environment**: Use simulated data for testing. Switch to live data only during actual contest.

5. **Fallback**: Keep sample data implementation as fallback if Upstox API is unavailable.

## Troubleshooting

### Issue: Token expired error
**Solution**: Re-authenticate through admin panel daily

### Issue: Instrument download fails
**Solution**: Check network connectivity, retry after a few minutes

### Issue: Price updates not working
**Solution**: Verify token is valid, check rate limits, review logs

### Issue: OAuth redirect fails
**Solution**: Ensure redirect URI matches exactly in Upstox app settings

## Resources

- [Upstox API Documentation](https://upstox.com/developer/api-documentation)
- [Upstox Python SDK](https://github.com/upstox/upstox-python)
- [OAuth 2.0 Guide](https://upstox.com/developer/api-documentation/open-api/)
- [Rate Limits](https://upstox.com/developer/api-documentation/rate-limits/)

## Support

For Upstox API issues:
- Email: api@upstox.com
- Community: [Upstox Developer Forum](https://community.upstox.com/)

For platform issues:
- Check `/var/log/supervisor/backend.err.log`
- Review application logs
- Contact your development team
