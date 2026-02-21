import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

/*
  🔥 IMPORTANT:
  - Vercel ENV should be:
      REACT_APP_API_BASE_URL = https://astra-trade.onrender.com
  - Do NOT include /api in the environment variable
*/

const RAW_BASE =
  process.env.REACT_APP_API_BASE_URL ||
  process.env.REACT_APP_BACKEND_URL ||
  "https://astra-trade.onrender.com";

// Remove trailing slash if present
const CLEAN_BASE = RAW_BASE.endsWith('/')
  ? RAW_BASE.slice(0, -1)
  : RAW_BASE;

// If someone mistakenly added /api in ENV, remove it
const API_BASE = CLEAN_BASE.endsWith('/api')
  ? CLEAN_BASE.replace(/\/api$/, '')
  : CLEAN_BASE;

const API = `${API_BASE}/api`;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      fetchUser();
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const fetchUser = async () => {
    try {
      const response = await axios.get(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUser(response.data);
    } catch (error) {
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    const response = await axios.post(`${API}/auth/login`, {
      email,
      password
    });

    const { access_token, user: userData } = response.data;

    setToken(access_token);
    setUser(userData);
    localStorage.setItem('token', access_token);

    return userData;
  };

  const register = async (username, email, password) => {
    const response = await axios.post(`${API}/auth/register`, {
      username,
      email,
      password
    });

    const { access_token, user: userData } = response.data;

    setToken(access_token);
    setUser(userData);
    localStorage.setItem('token', access_token);

    return userData;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};