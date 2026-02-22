import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Search, TrendingUp, TrendingDown, WifiOff, Wifi, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { usePriceWebSocket } from '../hooks/usePriceWebSocket';

const MarketPage = () => {
  const { token } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [stocks, setStocks] = useState([]);
  const [selectedStock, setSelectedStock] = useState(null);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [tradeType, setTradeType] = useState('BUY');
  const [quantity, setQuantity] = useState('');
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);

  const { prices, connectionStatus, statusMessage, subscribe, unsubscribe } = usePriceWebSocket();

  const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

  // Initial load
  useEffect(() => {
    searchStocks('');
  }, []);

  // Auto-subscribe to all visible stocks whenever stock list changes
  useEffect(() => {
    if (stocks.length === 0) return;
    const instrumentKeys = stocks.map(s => s.instrument_key).filter(Boolean);
    subscribe(instrumentKeys);
    return () => {
      unsubscribe(instrumentKeys);
    };
  }, [stocks]);

  const searchStocks = async (query) => {
    setSearching(true);
    try {
      const response = await axios.get(`${API}/stocks/search`, {
        params: { q: query }
      });
      setStocks(response.data.results || []);
    } catch (error) {
      console.error('Search failed:', error);
      toast.error('Search failed. Please try again.');
    } finally {
      setSearching(false);
    }
  };

  // Debounced search on query change
  useEffect(() => {
    const timer = setTimeout(() => {
      searchStocks(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const openTradeModal = (stock, type) => {
    setSelectedStock(stock);
    setTradeType(type);
    setQuantity('');
    setShowTradeModal(true);
  };

  const getLivePrice = useCallback((instrumentKey) => {
    return prices[instrumentKey]?.last_price || null;
  }, [prices]);

  const executeTrade = async () => {
    if (!quantity || parseInt(quantity) <= 0) {
      toast.error('Please enter a valid quantity');
      return;
    }
    const currentPrice = getLivePrice(selectedStock?.instrument_key);
    if (!currentPrice) {
      toast.error('No live price available. Please wait for market data.');
      return;
    }
    setLoading(true);
    try {
      await axios.post(
        `${API}/trade`,
        {
          instrument_key: selectedStock.instrument_key,
          symbol: selectedStock.trading_symbol, // FIX: was selectedStock.symbol which is undefined
          quantity: parseInt(quantity),
          trade_type: tradeType
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(`${tradeType === 'BUY' ? '🟢 Bought' : '🔴 Sold'} ${quantity} × ${selectedStock.trading_symbol} @ ₹${currentPrice.toFixed(2)}`);
      setShowTradeModal(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Trade failed');
    } finally {
      setLoading(false);
    }
  };

  const totalAmount = () => {
    const price = getLivePrice(selectedStock?.instrument_key);
    const qty = parseInt(quantity);
    if (!price || !qty || qty <= 0) return null;
    return (price * qty).toFixed(2);
  };

  const statusConfig = {
    connected: { icon: Wifi, color: 'text-emerald-400', bg: 'bg-emerald-900/20 border-emerald-700/30', label: 'Live' },
    disconnected: { icon: WifiOff, color: 'text-yellow-400', bg: 'bg-yellow-900/20 border-yellow-700/30', label: 'Reconnecting...' },
    error: { icon: WifiOff, color: 'text-red-400', bg: 'bg-red-900/20 border-red-700/30', label: 'Error' },
    connecting: { icon: RefreshCw, color: 'text-blue-400', bg: 'bg-blue-900/20 border-blue-700/30', label: 'Connecting...' },
  };
  const status = statusConfig[connectionStatus] || statusConfig.connecting;
  const StatusIcon = status.icon;

  return (
    <div className="p-4 md:p-8 space-y-6" data-testid="market-page">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold">Market</h1>
          <p className="text-muted-foreground mt-1">Search and trade NSE stocks with live prices</p>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium ${status.bg} ${status.color}`}>
          <StatusIcon className={`w-4 h-4 ${connectionStatus === 'connecting' ? 'animate-spin' : ''}`} />
          {status.label}
        </div>
      </div>

      {/* Disconnected Banner */}
      {connectionStatus !== 'connected' && (
        <div className={`flex items-center gap-3 p-4 rounded-xl border ${status.bg}`}>
          <StatusIcon className={`w-5 h-5 ${status.color} flex-shrink-0`} />
          <div>
            <div className={`font-medium ${status.color}`}>{statusMessage || 'Connecting to live feed...'}</div>
            <div className="text-sm text-slate-400 mt-0.5">
              Prices will appear once connected. Trading requires live prices.
            </div>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
        <input
          data-testid="stock-search-input"
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search stocks by symbol or name (e.g. RELIANCE, INFY)..."
          className="w-full pl-12 pr-4 py-4 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-lg"
        />
        {searching && (
          <RefreshCw className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 animate-spin" />
        )}
      </div>

      {stocks.length > 0 && (
        <p className="text-sm text-slate-500">{stocks.length} instruments found</p>
      )}

      {/* Stock Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stocks.map((stock) => {
          const priceData = prices[stock.instrument_key];
          const currentPrice = priceData?.last_price;
          const changePercent = priceData?.change_percent ?? 0;
          const isPositive = changePercent >= 0;
          const hasPrice = currentPrice != null;

          return (
            <div
              key={stock.instrument_key}
              className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 hover:bg-slate-800/70 hover:shadow-lg transition-all"
              data-testid={`stock-card-${stock.trading_symbol}`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl font-bold text-white truncate">{stock.trading_symbol}</h3>
                  <p className="text-sm text-slate-400 truncate">{stock.name}</p>
                  <p className="text-xs text-slate-600 mt-0.5">{stock.exchange}</p>
                </div>
                {hasPrice && (
                  <div className={`ml-2 flex-shrink-0 text-xs font-semibold px-2 py-1 rounded-md flex items-center gap-1 ${
                    isPositive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                  }`}>
                    {isPositive ? '▲' : '▼'} {isPositive ? '+' : ''}{changePercent.toFixed(2)}%
                  </div>
                )}
              </div>

              <div className="mb-5">
                {hasPrice ? (
                  <>
                    <div className="text-3xl font-bold font-mono tabular-nums text-white">
                      ₹{currentPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                      <span className="text-xs text-slate-500">Live</span>
                      {priceData?.volume > 0 && (
                        <span className="text-xs text-slate-600 ml-1">Vol: {priceData.volume.toLocaleString('en-IN')}</span>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="space-y-2">
                    <div className="text-2xl font-bold font-mono text-slate-600">
                      {connectionStatus === 'connected' ? 'Fetching...' : '₹---.--'}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-slate-600"></div>
                      <span className="text-xs text-slate-600">
                        {connectionStatus === 'connected' ? 'Awaiting price data' : 'No feed'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => openTradeModal(stock, 'BUY')}
                  disabled={!hasPrice}
                  data-testid={`buy-button-${stock.trading_symbol}`}
                  className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white rounded-lg transition-all active:scale-95 font-medium flex items-center justify-center gap-2"
                >
                  <TrendingUp className="w-4 h-4" /> Buy
                </button>
                <button
                  onClick={() => openTradeModal(stock, 'SELL')}
                  disabled={!hasPrice}
                  data-testid={`sell-button-${stock.trading_symbol}`}
                  className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white rounded-lg transition-all active:scale-95 font-medium flex items-center justify-center gap-2"
                >
                  <TrendingDown className="w-4 h-4" /> Sell
                </button>
              </div>
            </div>
          );
        })}

        {!searching && stocks.length === 0 && (
          <div className="col-span-full text-center py-16 text-slate-500">
            <Search className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg">No stocks found</p>
            <p className="text-sm mt-1">Try searching for RELIANCE, INFY, TCS...</p>
          </div>
        )}
      </div>

      {/* Trade Modal */}
      {showTradeModal && selectedStock && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowTradeModal(false); }}
        >
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl" data-testid="trade-modal">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-white">
                  {tradeType === 'BUY' ? '🟢 Buy' : '🔴 Sell'} {selectedStock.trading_symbol}
                </h2>
                <p className="text-sm text-slate-400 mt-0.5">{selectedStock.name}</p>
              </div>
              <button onClick={() => setShowTradeModal(false)} className="text-slate-400 hover:text-white transition-colors text-2xl leading-none">×</button>
            </div>

            <div className="space-y-5">
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
                <div className="text-sm text-slate-400 mb-1">Live Market Price</div>
                {getLivePrice(selectedStock.instrument_key) ? (
                  <div className="flex items-baseline gap-3">
                    <span className="text-3xl font-bold font-mono text-white">
                      ₹{getLivePrice(selectedStock.instrument_key).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    {prices[selectedStock.instrument_key]?.change_percent != null && (
                      <span className={`text-sm font-semibold ${prices[selectedStock.instrument_key].change_percent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {prices[selectedStock.instrument_key].change_percent >= 0 ? '+' : ''}
                        {prices[selectedStock.instrument_key].change_percent.toFixed(2)}%
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="text-slate-500">Awaiting live price...</div>
                )}
                <div className="flex items-center gap-1.5 mt-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                  <span className="text-xs text-slate-500">Updates in real-time</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Quantity</label>
                <input
                  data-testid="quantity-input"
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  min="1"
                  step="1"
                  placeholder="Enter number of shares..."
                  autoFocus
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-lg"
                />
              </div>

              {totalAmount() && (
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Price per share</span>
                    <span className="text-white font-mono">₹{getLivePrice(selectedStock.instrument_key).toFixed(2)}</span>
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
                disabled={loading || !getLivePrice(selectedStock.instrument_key)}
                data-testid="confirm-trade-button"
                className={`flex-1 py-3 px-4 rounded-xl text-white font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg ${
                  tradeType === 'BUY' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'
                }`}
              >
                {loading ? 'Processing...' : !getLivePrice(selectedStock.instrument_key) ? 'Awaiting Price...' : `Confirm ${tradeType} ${tradeType === 'BUY' ? '▲' : '▼'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MarketPage;