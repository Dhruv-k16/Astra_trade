# Campus Trading Competition - Local Setup Guide

This guide will help you set up and run the complete trading competition platform on your local machine.

## Project Overview

A full-stack web application for a college trading competition simulating real Indian NSE equity trading.

- **Backend:** FastAPI (Python)
- **Frontend:** React (with TailwindCSS & Shadcn UI)
- **Database:** MongoDB

---

## Prerequisites

Make sure you have the following installed on your system:

| Tool | Version | Download Link |
|------|---------|---------------|
| **Python** | 3.10+ | [python.org](https://www.python.org/downloads/) |
| **Node.js** | 18+ | [nodejs.org](https://nodejs.org/) |
| **Yarn** | 1.22+ | `npm install -g yarn` |
| **MongoDB** | 6.0+ | [mongodb.com](https://www.mongodb.com/try/download/community) |

---

## Project Structure

```
trading-competition/
├── backend/
│   ├── .env                    # Backend environment variables
│   ├── requirements.txt        # Python dependencies
│   ├── server.py               # Main FastAPI application
│   ├── auth.py                 # Authentication utilities
│   ├── models.py               # Pydantic models
│   ├── market_timing.py        # Market hours logic
│   ├── trade_engine.py         # Trade execution logic
│   └── websocket_manager.py    # WebSocket price feed manager
│
├── frontend/
│   ├── .env                    # Frontend environment variables
│   ├── package.json            # Node.js dependencies
│   ├── tailwind.config.js      # TailwindCSS configuration
│   └── src/
│       ├── App.js              # Main React Router
│       ├── components/         # Reusable UI components
│       ├── hooks/              # Custom React hooks
│       └── pages/              # Application pages
│
└── documentation/              # Project documentation
```

---

## Step 1: Clone/Download the Project

If you have the project as a ZIP file, extract it to your desired location.

If using Git:
```bash
git clone <repository-url>
cd trading-competition
```

---

## Step 2: Set Up MongoDB

### Option A: Local MongoDB Installation

1. **Start MongoDB service:**

   **macOS (Homebrew):**
   ```bash
   brew services start mongodb-community
   ```

   **Windows:**
   ```bash
   # Run as Administrator
   net start MongoDB
   ```

   **Linux (systemd):**
   ```bash
   sudo systemctl start mongod
   ```

2. **Verify MongoDB is running:**
   ```bash
   mongosh
   # You should see the MongoDB shell prompt
   ```

### Option B: MongoDB Atlas (Cloud)

1. Create a free account at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a new cluster
3. Get your connection string (looks like: `mongodb+srv://username:password@cluster.xxxxx.mongodb.net/`)
4. Use this connection string in your backend `.env` file

---

## Step 3: Set Up the Backend

### 3.1 Navigate to Backend Directory
```bash
cd backend
```

### 3.2 Create a Virtual Environment (Recommended)
```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment
# On macOS/Linux:
source venv/bin/activate

# On Windows:
venv\Scripts\activate
```

### 3.3 Install Python Dependencies
```bash
pip install -r requirements.txt
```

### 3.4 Configure Environment Variables

Create or update the `.env` file in the `backend/` directory:

```env
# MongoDB Connection
MONGO_URL=mongodb://localhost:27017
DB_NAME=trading_competition

# CORS Settings (for local development)
CORS_ORIGINS=http://localhost:3000

# JWT Secret (generate a secure random string)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Optional: Upstox API (for real market data)
# UPSTOX_CLIENT_ID=your-client-id
# UPSTOX_CLIENT_SECRET=your-client-secret
# UPSTOX_REDIRECT_URI=http://localhost:8001/api/upstox/callback
```

### 3.5 Start the Backend Server
```bash
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

The backend API will be available at: `http://localhost:8001`

**Verify it's running:**
```bash
curl http://localhost:8001/api/health
# Should return: {"status": "healthy", ...}
```

---

## Step 4: Set Up the Frontend

### 4.1 Navigate to Frontend Directory
```bash
# From the project root
cd frontend
```

### 4.2 Install Node.js Dependencies
```bash
yarn install
```

### 4.3 Configure Environment Variables

Create or update the `.env` file in the `frontend/` directory:

```env
# Backend API URL (point to your local backend)
REACT_APP_BACKEND_URL=http://localhost:8001

# WebSocket configuration
WDS_SOCKET_PORT=3000

# Optional: Disable health check for local dev
ENABLE_HEALTH_CHECK=false
```

### 4.4 Start the Frontend Development Server
```bash
yarn start
```

The frontend will be available at: `http://localhost:3000`

---

## Step 5: Access the Application

1. Open your browser and navigate to: `http://localhost:3000`

2. **Default Admin Credentials:**
   - Email: `admin@campus.edu`
   - Password: `Admin@123`

3. **To create a new participant:**
   - Click "Register" on the login page
   - Fill in the registration form
   - New users get ₹10,00,000 virtual balance

---

## Available Pages

| Page | URL | Description |
|------|-----|-------------|
| Login | `/` | User authentication |
| Dashboard | `/dashboard` | Overview of portfolio & market |
| Market | `/market` | Browse and trade stocks |
| Portfolio | `/portfolio` | View holdings & performance |
| Orders | `/orders` | Order history |
| Leaderboard | `/leaderboard` | Competition rankings |
| Admin Panel | `/admin` | User management (admin only) |

---

## API Documentation

Once the backend is running, access the interactive API documentation:

- **Swagger UI:** `http://localhost:8001/docs`
- **ReDoc:** `http://localhost:8001/redoc`

### Key API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register` | POST | Register new user |
| `/api/auth/login` | POST | User login |
| `/api/portfolio` | GET | Get user portfolio |
| `/api/trades/buy` | POST | Buy stocks |
| `/api/trades/sell` | POST | Sell stocks |
| `/api/orders` | GET | Get order history |
| `/api/leaderboard` | GET | Get leaderboard |
| `/api/admin/users` | GET | List all users (admin) |

---

## Running Both Services Together

For convenience, you can run both services in separate terminal windows:

**Terminal 1 (Backend):**
```bash
cd backend
source venv/bin/activate  # if using virtual environment
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

**Terminal 2 (Frontend):**
```bash
cd frontend
yarn start
```

---

## Troubleshooting

### MongoDB Connection Issues
```bash
# Check if MongoDB is running
mongosh --eval "db.adminCommand('ping')"

# If not running, start it:
# macOS: brew services start mongodb-community
# Linux: sudo systemctl start mongod
# Windows: net start MongoDB
```

### Port Already in Use
```bash
# Find process using port 8001 (backend)
lsof -i :8001
# Kill it: kill -9 <PID>

# Find process using port 3000 (frontend)
lsof -i :3000
# Kill it: kill -9 <PID>
```

### Python Dependencies Issues
```bash
# Upgrade pip
pip install --upgrade pip

# Reinstall dependencies
pip install -r requirements.txt --force-reinstall
```

### Node.js/Yarn Issues
```bash
# Clear cache and reinstall
rm -rf node_modules
rm yarn.lock
yarn install
```

### CORS Errors
Make sure the `CORS_ORIGINS` in backend `.env` includes your frontend URL:
```env
CORS_ORIGINS=http://localhost:3000
```

---

## Contest Configuration

### Trading Rules (Default Settings)
- **Starting Capital:** ₹10,00,000
- **Market Hours:** 9:15 AM - 3:30 PM IST
- **Maximum per stock:** 50% of capital
- **No short selling allowed**

### Modifying Contest Settings
Edit the constants in `backend/server.py`:
```python
STARTING_CAPITAL = 1000000  # Change starting balance
```

---

## Production Deployment Notes

For production deployment, ensure you:

1. **Set secure JWT secret** in backend `.env`
2. **Use MongoDB Atlas** or a secured MongoDB instance
3. **Set proper CORS origins** (not `*`)
4. **Integrate Upstox API** for real market data
5. **Use HTTPS** for all connections
6. **Set `DEBUG=false`** and remove development settings

---

## Support

For issues or questions:
1. Check the `documentation/` folder for additional guides
2. Review the API docs at `/docs`
3. Check backend logs for error details

---

## License

This project is for educational purposes as part of a college trading competition.
