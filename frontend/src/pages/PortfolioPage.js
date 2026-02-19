import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Briefcase, TrendingUp, TrendingDown } from 'lucide-react';

const PortfolioPage = () => {
  const { token } = useAuth();
  const [portfolio, setPortfolio] = useState(null);
  const [loading, setLoading] = useState(true);

  const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

  useEffect(() => {
    fetchPortfolio();
    const interval = setInterval(fetchPortfolio, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchPortfolio = async () => {
    try {
      const response = await axios.get(`${API}/portfolio`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPortfolio(response.data);
    } catch (error) {
      console.error('Failed to fetch portfolio:', error);
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

  return (
    <div className="p-4 md:p-8 space-y-6" data-testid="portfolio-page">
      <div>
        <h1 className="text-4xl font-bold">Portfolio</h1>
        <p className="text-muted-foreground mt-2">View your current holdings and performance</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="text-sm text-muted-foreground mb-1">Total Value</div>
          <div className="text-2xl font-bold font-mono">
            ₹{portfolio?.current_value?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="text-sm text-muted-foreground mb-1">Invested</div>
          <div className="text-2xl font-bold font-mono">
            ₹{portfolio?.invested_amount?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="text-sm text-muted-foreground mb-1">Total P&L</div>
          <div className={`text-2xl font-bold font-mono ${
            portfolio?.total_pnl >= 0 ? 'text-gain' : 'text-loss'
          }`}>
            {portfolio?.total_pnl >= 0 ? '▲ +' : '▼ '}₹{portfolio?.total_pnl?.toFixed(2)}
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="text-sm text-muted-foreground mb-1">Cash Balance</div>
          <div className="text-2xl font-bold font-mono">
            ₹{portfolio?.cash_balance?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Holdings Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-6 border-b border-border">
          <h2 className="text-2xl font-semibold">Holdings</h2>
        </div>
        {portfolio?.holdings?.length === 0 ? (
          <div className="p-12 text-center">
            <Briefcase className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No holdings yet. Start trading to build your portfolio.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-4 font-semibold">Symbol</th>
                  <th className="text-right p-4 font-semibold">Quantity</th>
                  <th className="text-right p-4 font-semibold">Avg Price</th>
                  <th className="text-right p-4 font-semibold">Current Price</th>
                  <th className="text-right p-4 font-semibold">Invested</th>
                  <th className="text-right p-4 font-semibold">Current Value</th>
                  <th className="text-right p-4 font-semibold">P&L</th>
                  <th className="text-right p-4 font-semibold">P&L %</th>
                </tr>
              </thead>
              <tbody>
                {portfolio?.holdings?.map((holding, index) => {
                  const pnlPositive = holding.pnl >= 0;
                  return (
                    <tr key={index} className="border-t border-border hover:bg-muted/30 transition-colors">
                      <td className="p-4 font-semibold">{holding.trading_symbol}</td>
                      <td className="p-4 text-right font-mono">{holding.quantity}</td>
                      <td className="p-4 text-right font-mono">₹{holding.avg_price.toFixed(2)}</td>
                      <td className="p-4 text-right font-mono">₹{holding.current_price.toFixed(2)}</td>
                      <td className="p-4 text-right font-mono">₹{holding.invested.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className="p-4 text-right font-mono">₹{holding.current_value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className={`p-4 text-right font-mono font-semibold ${
                        pnlPositive ? 'text-success' : 'text-destructive'
                      }`}>
                        {pnlPositive ? '+' : ''}₹{holding.pnl.toFixed(2)}
                      </td>
                      <td className={`p-4 text-right font-mono font-semibold ${
                        pnlPositive ? 'text-success' : 'text-destructive'
                      }`}>
                        {pnlPositive ? '+' : ''}{holding.pnl_percentage.toFixed(2)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default PortfolioPage;