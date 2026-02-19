# Campus Trading Competition Platform - PRD

## Original Problem Statement
Build a full-stack web application for a 5–6 day college trading competition for approximately 50 participants. The platform must simulate real Indian NSE equity trading using live market price data from the Upstox API, without involving real money.

## Core Requirements
- **Tech Stack:** React (Vite+TS), TailwindCSS, FastAPI, JWT, MongoDB
- **User Roles:** Participant (Trader) and Admin
- **Starting Capital:** ₹10,00,000
- **Market Hours:** 9:15 AM – 3:30 PM IST
- **Winner Criteria:** Highest percentage return (tie-breaker: least trades)

## What's Implemented

### Completed Features (as of Dec 2025)
- [x] Full-stack application (FastAPI backend + React frontend)
- [x] JWT-based authentication (user/admin roles)
- [x] Core trading logic (buy/sell stocks)
- [x] Portfolio management and order history
- [x] WebSocket-based simulated price feed
- [x] Admin panel with user management
- [x] Contest freeze/unfreeze controls
- [x] Modern dark fintech UI theme
- [x] Leaderboard with percentage return ranking
- [x] **Local Setup Guide** (`/app/LOCAL_SETUP_GUIDE.md`)

### Mocked Features
- Real-time price feed is **SIMULATED** (not connected to Upstox API)

## Pending Tasks

### P0 - Critical
- [ ] Upstox OAuth callback endpoint implementation
  - Requires: `UPSTOX_CLIENT_ID`, `UPSTOX_CLIENT_SECRET`

### P1 - High Priority
- [ ] Real Upstox WebSocket integration for live prices
- [ ] Instrument Master population (fetch NSE stock list)

### P2 - Medium Priority
- [ ] Leaderboard tie-breaker (lowest trade count wins)
- [ ] Export leaderboard to CSV (admin feature)
- [ ] Contest reset functionality

### P3 - Backlog
- [ ] Backend refactoring (split `server.py` into modules)

## Key Credentials
- **Admin:** `admin@campus.edu` / `Admin@123`

## API Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register` | POST | Register user |
| `/api/auth/login` | POST | Login |
| `/api/portfolio` | GET | Get portfolio |
| `/api/trades/buy` | POST | Buy stocks |
| `/api/trades/sell` | POST | Sell stocks |
| `/api/orders` | GET | Order history |
| `/api/leaderboard` | GET | Leaderboard |
| `/api/admin/users` | GET | List users (admin) |

## Files of Reference
- `/app/backend/server.py` - Main API
- `/app/backend/websocket_manager.py` - Price feed
- `/app/frontend/src/pages/` - UI pages
- `/app/LOCAL_SETUP_GUIDE.md` - Local setup instructions
