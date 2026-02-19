import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { TrendingUp, TrendingDown, Clock, AlertCircle, CheckCircle } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const DashboardPage = () => {
  const { token } = useAuth();
  const [portfolio, setPortfolio] = useState(null);
  const [marketStatus, setMarketStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      fetchData();
    }, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const [portfolioRes, statusRes] = await Promise.all([
        axios.get(`${API}/portfolio`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API}/market/status`)
      ]);
      setPortfolio(portfolioRes.data);
      setMarketStatus(statusRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const pnlPositive = portfolio?.total_pnl >= 0;
  const pnlClass = pnlPositive ? 'text-gain' : 'text-loss';
  const pnlIcon = pnlPositive ? TrendingUp : TrendingDown;

  return (
    <div className="p-4 md:p-8 space-y-6" data-testid="dashboard-page">
      {/* Market Status Bar */}
      <div className={`backdrop-blur-md bg-slate-900/80 border border-slate-700 rounded-xl p-4 shadow-modern ${ 
        marketStatus?.is_open ? 'border-l-4 border-l-emerald-500' : 'border-l-4 border-l-red-500'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {marketStatus?.is_open ? (
              <CheckCircle className="w-5 h-5 text-emerald-400" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-400" />
            )}
            <div>
              <div className="font-semibold text-white">
                {marketStatus?.is_open ? 'Market Open' : 'Market Closed'}
              </div>
              <div className="text-sm text-slate-400">{marketStatus?.message}</div>
            </div>
          </div>
          <div className="flex items-center space-x-2 text-sm text-slate-400">
            <Clock className="w-4 h-4" />
            <span>{marketStatus?.current_time}</span>
          </div>
        </div>
      </div>

      {/* Portfolio Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Total Portfolio Value */}
        <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50 rounded-xl p-6 shadow-modern hover:shadow-modern-lg transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-slate-400">Total Portfolio Value</div>
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-blue-400" />
            </div>
          </div>
          <div className="text-3xl font-bold font-mono tabular-nums text-white">
            ₹{portfolio?.current_value?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="mt-2 text-sm text-slate-400">
            Starting: ₹10,00,000.00
          </div>
        </div>

        {/* Total P&L */}
        <div className={`bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50 rounded-xl p-6 shadow-modern hover:shadow-modern-lg transition-shadow ${
          pnlPositive ? 'border-l-4 border-l-emerald-500' : 'border-l-4 border-l-red-500'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-slate-400">Total P&L</div>
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              pnlPositive ? 'bg-emerald-500/20' : 'bg-red-500/20'
            }`}>
              {React.createElement(pnlIcon, { className: `w-5 h-5 ${pnlPositive ? 'text-emerald-400' : 'text-red-400'}` })}
            </div>
          </div>
          <div className={`text-3xl font-bold font-mono tabular-nums flex items-center gap-2 ${pnlClass}`}>
            {pnlPositive ? '+' : ''}₹{portfolio?.total_pnl?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className={`mt-2 text-sm font-medium flex items-center gap-1 ${pnlClass}`}>
            {pnlPositive ? '▲' : '▼'} {pnlPositive ? '+' : ''}{portfolio?.total_pnl_percentage?.toFixed(2)}%
          </div>
        </div>

        {/* Cash Balance */}
        <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50 rounded-xl p-6 shadow-modern hover:shadow-modern-lg transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-slate-400">Available Cash</div>
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-amber-400" />
            </div>
          </div>
          <div className="text-3xl font-bold font-mono tabular-nums text-white">
            ₹{portfolio?.cash_balance?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="mt-2 text-sm text-slate-400">
            Invested: ₹{portfolio?.invested_amount?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </div>
        </div>
      </div>

      {/* Holdings */}
      <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl shadow-modern">
        <div className="p-6 border-b border-slate-700/50">
          <h2 className="text-2xl font-semibold text-white">Your Holdings</h2>
          <p className="text-sm text-slate-400 mt-1">
            {portfolio?.holdings?.length || 0} stocks in portfolio
          </p>
        </div>
        <div className="p-6">
          {portfolio?.holdings?.length === 0 ? (
            <div className="text-center py-12">
              <TrendingUp className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground">No holdings yet</h3>
              <p className="text-sm text-muted-foreground mt-2">Start trading to build your portfolio</p>
            </div>
          ) : (
            <div className="space-y-4">
              {portfolio?.holdings?.map((holding, index) => {
                const holdingPnlPositive = holding.pnl >= 0;
                const holdingPnlClass = holdingPnlPositive ? 'text-gain' : 'text-loss';
                return (
                  <div
                    key={index}
                    className="flex items-center justify-between p-4 rounded-lg border border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="font-semibold text-lg text-white">{holding.trading_symbol}</div>
                      <div className="text-sm text-slate-400">
                        {holding.quantity} shares @ ₹{holding.avg_price.toFixed(2)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-semibold text-white">
                        ₹{holding.current_value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div className={`text-sm font-medium flex items-center justify-end gap-1 ${holdingPnlClass}`}>
                        {holdingPnlPositive ? '▲' : '▼'} {holdingPnlPositive ? '+' : ''}₹{holding.pnl.toFixed(2)} ({holdingPnlPositive ? '+' : ''}{holding.pnl_percentage.toFixed(2)}%)
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;