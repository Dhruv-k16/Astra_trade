import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Briefcase, TrendingUp, TrendingDown, DollarSign, ShoppingCart, X } from 'lucide-react';
import { toast } from 'sonner';
import { usePriceWebSocket } from '../hooks/usePriceWebSocket';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PortfolioPage = () => {
  const { token } = useAuth();
  const [portfolio, setPortfolio] = useState(null);
  const [loading, setLoading] = useState(true);

  // Trade modal state
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [selectedHolding, setSelectedHolding] = useState(null);
  const [tradeType, setTradeType] = useState('SELL');
  const [quantity, setQuantity] = useState('');
  const [tradeLoading, setTradeLoading] = useState(false);

  const { prices, subscribe } = usePriceWebSocket();

  useEffect(() => {
    fetchPortfolio();
    const interval = setInterval(fetchPortfolio, 30000);
    return () => clearInterval(interval);
  }, []);

  // Subscribe to all held instruments for live prices
  useEffect(() => {
    if (!portfolio?.holdings?.length) return;
    const keys = portfolio.holdings.map(h => h.instrument_key).filter(Boolean);
    subscribe(keys);
  }, [portfolio]);

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

  const getLivePrice = (instrumentKey) => prices[instrumentKey]?.last_price || null;

  const openTradeModal = (holding, type) => {
    setSelectedHolding(holding);
    setTradeType(type);
    setQuantity('');
    setShowTradeModal(true);
  };

  const totalAmount = () => {
    if (!quantity || !selectedHolding) return null;
    const price = getLivePrice(selectedHolding.instrument_key) || selectedHolding.current_price;
    const total = price * parseInt(quantity);
    return isNaN(total) ? null : total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const executeTrade = async () => {
    if (!quantity || parseInt(quantity) <= 0) { toast.error('Enter a valid quantity'); return; }
    const livePrice = getLivePrice(selectedHolding.instrument_key);
    if (!livePrice) { toast.error('No live price available'); return; }

    setTradeLoading(true);
    try {
      await axios.post(`${API}/trade`, {
        instrument_key: selectedHolding.instrument_key,
        trading_symbol: selectedHolding.trading_symbol,
        quantity: parseInt(quantity),
        trade_type: tradeType
      }, { headers: { Authorization: `Bearer ${token}` } });

      toast.success(`${tradeType === 'BUY' ? '🟢 Bought' : '🔴 Sold'} ${quantity} × ${selectedHolding.trading_symbol} @ ₹${livePrice.toFixed(2)}`);
      setShowTradeModal(false);
      fetchPortfolio(); // Refresh portfolio after trade
    } catch (error) {
      const detail = error.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map(e => e.msg).join(', ') : 'Trade failed';
      toast.error(msg);
    } finally {
      setTradeLoading(false);
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
        <div className="bg-gradient-to-br from-blue-900/30 to-slate-900/50 border border-blue-700/30 rounded-xl p-6 shadow-modern">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-slate-400">Total Value</div>
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-blue-400" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            ₹{portfolio?.current_value?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50 rounded-xl p-6 shadow-modern">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-slate-400">Invested</div>
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-purple-400" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            ₹{portfolio?.invested_amount?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </div>
        </div>

        <div className={`bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50 rounded-xl p-6 shadow-modern ${
          portfolio?.total_pnl >= 0 ? 'border-l-4 border-l-emerald-500' : 'border-l-4 border-l-red-500'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-slate-400">Total P&L</div>
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${portfolio?.total_pnl >= 0 ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
              {portfolio?.total_pnl >= 0 ? <TrendingUp className="w-5 h-5 text-emerald-400" /> : <TrendingDown className="w-5 h-5 text-red-400" />}
            </div>
          </div>
          <div className={`text-2xl font-bold font-mono ${portfolio?.total_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {portfolio?.total_pnl >= 0 ? '▲ +' : '▼ '}₹{portfolio?.total_pnl?.toFixed(2)}
          </div>
        </div>

        <div className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700/50 rounded-xl p-6 shadow-modern">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-slate-400">Cash Balance</div>
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-amber-400" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            ₹{portfolio?.cash_balance?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Holdings Table */}
      <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl overflow-hidden shadow-modern">
        <div className="p-6 border-b border-slate-700/50">
          <h2 className="text-2xl font-semibold text-white">Holdings</h2>
        </div>
        {portfolio?.holdings?.length === 0 ? (
          <div className="p-12 text-center">
            <Briefcase className="w-16 h-16 mx-auto text-slate-600 mb-4" />
            <p className="text-slate-400">No holdings yet. Start trading to build your portfolio.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800/50">
                <tr>
                  <th className="text-left p-4 font-semibold text-slate-300">Symbol</th>
                  <th className="text-right p-4 font-semibold text-slate-300">Qty</th>
                  <th className="text-right p-4 font-semibold text-slate-300">Avg Price</th>
                  <th className="text-right p-4 font-semibold text-slate-300">Live Price</th>
                  <th className="text-right p-4 font-semibold text-slate-300">Invested</th>
                  <th className="text-right p-4 font-semibold text-slate-300">Current Value</th>
                  <th className="text-right p-4 font-semibold text-slate-300">P&L</th>
                  <th className="text-right p-4 font-semibold text-slate-300">P&L %</th>
                  <th className="text-center p-4 font-semibold text-slate-300">Action</th>
                </tr>
              </thead>
              <tbody>
                {portfolio?.holdings?.map((holding, index) => {
                  const livePrice = getLivePrice(holding.instrument_key);
                  const displayPrice = livePrice || holding.current_price;
                  const livePnl = livePrice
                    ? (livePrice - holding.avg_price) * holding.quantity
                    : holding.pnl;
                  const livePnlPct = livePrice
                    ? ((livePrice - holding.avg_price) / holding.avg_price) * 100
                    : holding.pnl_percentage;
                  const pnlPositive = livePnl >= 0;

                  return (
                    <tr key={index} className="border-t border-slate-700/50 hover:bg-slate-800/30 transition-colors">
                      <td className="p-4">
                        <div className="font-semibold text-white">{holding.trading_symbol}</div>
                      </td>
                      <td className="p-4 text-right font-mono text-slate-300">{holding.quantity}</td>
                      <td className="p-4 text-right font-mono text-slate-300">₹{holding.avg_price.toFixed(2)}</td>
                      <td className="p-4 text-right font-mono">
                        {livePrice ? (
                          <span className="text-white">
                            ₹{livePrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            <span className="ml-1 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block"></span>
                          </span>
                        ) : (
                          <span className="text-slate-500">₹{displayPrice.toFixed(2)}</span>
                        )}
                      </td>
                      <td className="p-4 text-right font-mono text-slate-300">₹{holding.invested.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className="p-4 text-right font-mono text-white">₹{(displayPrice * holding.quantity).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className={`p-4 text-right font-mono font-semibold ${pnlPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                        {pnlPositive ? '▲ +' : '▼ '}₹{Math.abs(livePnl).toFixed(2)}
                      </td>
                      <td className={`p-4 text-right font-mono font-semibold ${pnlPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                        {pnlPositive ? '+' : ''}{livePnlPct.toFixed(2)}%
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex gap-2 justify-center">
                          <button
                            onClick={() => openTradeModal(holding, 'BUY')}
                            className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600 border border-emerald-600/40 text-emerald-400 hover:text-white rounded-lg text-xs font-semibold transition-all"
                          >
                            + Buy
                          </button>
                          <button
                            onClick={() => openTradeModal(holding, 'SELL')}
                            className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600 border border-red-600/40 text-red-400 hover:text-white rounded-lg text-xs font-semibold transition-all"
                          >
                            Sell
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Trade Modal */}
      {showTradeModal && selectedHolding && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowTradeModal(false); }}
        >
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-white">
                  {tradeType === 'BUY' ? '🟢 Buy More' : '🔴 Sell'} {selectedHolding.trading_symbol}
                </h2>
                <p className="text-sm text-slate-400 mt-0.5">
                  You own <span className="text-white font-semibold">{selectedHolding.quantity} shares</span> · Avg ₹{selectedHolding.avg_price.toFixed(2)}
                </p>
              </div>
              <button onClick={() => setShowTradeModal(false)} className="text-slate-400 hover:text-white transition-colors text-2xl leading-none">×</button>
            </div>

            <div className="space-y-4">
              {/* Live price */}
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
                <div className="text-sm text-slate-400 mb-1">Live Market Price</div>
                {getLivePrice(selectedHolding.instrument_key) ? (
                  <div className="flex items-baseline gap-3">
                    <span className="text-3xl font-bold font-mono text-white">
                      ₹{getLivePrice(selectedHolding.instrument_key).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                      <span className="text-xs text-slate-500">Live</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-500">Using last known price ₹{selectedHolding.current_price.toFixed(2)}</div>
                )}
              </div>

              {/* P&L preview for sell */}
              {tradeType === 'SELL' && quantity && getLivePrice(selectedHolding.instrument_key) && (
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3">
                  <div className="text-xs text-slate-400 mb-1">Estimated P&L for this sale</div>
                  {(() => {
                    const lp = getLivePrice(selectedHolding.instrument_key);
                    const pnl = (lp - selectedHolding.avg_price) * parseInt(quantity || 0);
                    return (
                      <span className={`text-lg font-bold font-mono ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {pnl >= 0 ? '▲ +' : '▼ '}₹{Math.abs(pnl).toFixed(2)}
                      </span>
                    );
                  })()}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-slate-300">Quantity</label>
                  {tradeType === 'SELL' && (
                    <button
                      onClick={() => setQuantity(String(selectedHolding.quantity))}
                      className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      Sell all ({selectedHolding.quantity})
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  min="1"
                  max={tradeType === 'SELL' ? selectedHolding.quantity : undefined}
                  step="1"
                  placeholder="Number of shares..."
                  autoFocus
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-lg"
                />
                {tradeType === 'SELL' && quantity && parseInt(quantity) > selectedHolding.quantity && (
                  <p className="text-red-400 text-xs mt-1">You only own {selectedHolding.quantity} shares</p>
                )}
              </div>

              {totalAmount() && (
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Price per share</span>
                    <span className="text-white font-mono">₹{(getLivePrice(selectedHolding.instrument_key) || selectedHolding.current_price).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Quantity</span>
                    <span className="text-white">{quantity} shares</span>
                  </div>
                  <div className="border-t border-slate-700 pt-2 flex justify-between font-bold">
                    <span className="text-slate-300">Total {tradeType === 'BUY' ? 'Cost' : 'Proceeds'}</span>
                    <span className="text-white font-mono text-lg">₹{totalAmount()}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowTradeModal(false)}
                className="flex-1 py-3 px-4 border border-slate-700 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-all font-medium"
              >
                Cancel
              </button>
              <button
                onClick={executeTrade}
                disabled={tradeLoading || (tradeType === 'SELL' && quantity && parseInt(quantity) > selectedHolding.quantity)}
                className={`flex-1 py-3 px-4 rounded-xl text-white font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg ${
                  tradeType === 'BUY' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'
                }`}
              >
                {tradeLoading ? 'Processing...' : `Confirm ${tradeType} ${tradeType === 'BUY' ? '▲' : '▼'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PortfolioPage;