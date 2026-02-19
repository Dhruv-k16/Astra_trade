import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Search, TrendingUp, TrendingDown, ShoppingCart, DollarSign } from 'lucide-react';
import { toast } from 'sonner';

const MarketPage = () => {
  const { token } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [stocks, setStocks] = useState([]);
  const [selectedStock, setSelectedStock] = useState(null);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [tradeType, setTradeType] = useState('BUY');
  const [quantity, setQuantity] = useState('');
  const [loading, setLoading] = useState(false);
  const [prices, setPrices] = useState({});

  const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

  useEffect(() => {
    searchStocks('');
  }, []);

  useEffect(() => {
    if (stocks.length > 0) {
      fetchPrices();
      const interval = setInterval(fetchPrices, 15000);
      return () => clearInterval(interval);
    }
  }, [stocks]);

  const searchStocks = async (query) => {
    try {
      const response = await axios.get(`${API}/stocks/search?q=${query}`);
      setStocks(response.data.results);
    } catch (error) {
      console.error('Search failed:', error);
    }
  };

  const fetchPrices = async () => {
    try {
      const keys = stocks.map(s => s.instrument_key).join(',');
      if (keys) {
        const response = await axios.get(`${API}/stocks/prices?instrument_keys=${keys}`);
        setPrices(response.data.prices);
      }
    } catch (error) {
      console.error('Failed to fetch prices:', error);
    }
  };

  const handleSearch = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    searchStocks(query);
  };

  const openTradeModal = (stock, type) => {
    setSelectedStock(stock);
    setTradeType(type);
    setQuantity('');
    setShowTradeModal(true);
  };

  const executeTrade = async () => {
    if (!quantity || quantity <= 0) {
      toast.error('Please enter a valid quantity');
      return;
    }

    setLoading(true);
    try {
      await axios.post(
        `${API}/trade`,
        {
          instrument_key: selectedStock.instrument_key,
          trading_symbol: selectedStock.trading_symbol,
          quantity: parseInt(quantity),
          trade_type: tradeType
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(`${tradeType === 'BUY' ? 'Bought' : 'Sold'} ${quantity} shares of ${selectedStock.trading_symbol}`);
      setShowTradeModal(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Trade failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6" data-testid="market-page">
      <div>
        <h1 className="text-4xl font-bold">Market</h1>
        <p className="text-muted-foreground mt-2">Search and trade NSE stocks</p>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <input
          data-testid="stock-search-input"
          type="text"
          value={searchQuery}
          onChange={handleSearch}
          placeholder="Search stocks by symbol or name..."
          className="w-full pl-12 pr-4 py-4 bg-card border border-border rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all text-lg"
        />
      </div>

      {/* Stock List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stocks.map((stock) => {
          const priceData = prices[stock.instrument_key];
          const currentPrice = priceData?.last_price || 0;
          
          return (
            <div
              key={stock.instrument_key}
              className="bg-card border border-border rounded-xl p-6 hover:shadow-lg transition-all"
              data-testid={`stock-card-${stock.trading_symbol}`}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold">{stock.trading_symbol}</h3>
                  <p className="text-sm text-muted-foreground line-clamp-1">{stock.name}</p>
                </div>
              </div>
              
              <div className="mb-4">
                <div className="text-3xl font-bold font-mono tabular-nums">
                  ₹{currentPrice.toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Last updated: {priceData?.timestamp ? new Date(priceData.timestamp).toLocaleTimeString() : 'N/A'}
                </div>
              </div>

              <div className="flex space-x-2">
                <button
                  onClick={() => openTradeModal(stock, 'BUY')}
                  data-testid={`buy-button-${stock.trading_symbol}`}
                  className="flex-1 py-2 px-4 bg-gain text-white rounded-lg hover:opacity-90 transition-all active:scale-95 font-medium"
                >
                  Buy ▲
                </button>
                <button
                  onClick={() => openTradeModal(stock, 'SELL')}
                  data-testid={`sell-button-${stock.trading_symbol}`}
                  className="flex-1 py-2 px-4 bg-loss text-white rounded-lg hover:opacity-90 transition-all active:scale-95 font-medium"
                >
                  Sell ▼
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Trade Modal */}
      {showTradeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-xl max-w-md w-full p-6 shadow-xl" data-testid="trade-modal">
            <h2 className="text-2xl font-bold mb-4">
              {tradeType === 'BUY' ? 'Buy' : 'Sell'} {selectedStock?.trading_symbol}
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Current Price</label>
                <div className="text-2xl font-bold font-mono">
                  ₹{prices[selectedStock?.instrument_key]?.last_price?.toFixed(2)}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Quantity</label>
                <input
                  data-testid="quantity-input"
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  min="1"
                  placeholder="Enter quantity"
                  className="w-full px-4 py-3 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                />
              </div>

              {quantity > 0 && (
                <div className="bg-muted p-4 rounded-lg">
                  <div className="flex justify-between text-sm">
                    <span>Total Amount:</span>
                    <span className="font-bold font-mono">
                      ₹{(prices[selectedStock?.instrument_key]?.last_price * quantity).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => setShowTradeModal(false)}
                className="flex-1 py-3 px-4 border border-border rounded-lg hover:bg-muted transition-all font-medium"
              >
                Cancel
              </button>
              <button
                onClick={executeTrade}
                disabled={loading}
                data-testid="confirm-trade-button"
                className={`flex-1 py-3 px-4 rounded-lg text-white font-medium transition-all disabled:opacity-50 ${
                  tradeType === 'BUY' ? 'bg-success hover:bg-success/90' : 'bg-destructive hover:bg-destructive/90'
                }`}
              >
                {loading ? 'Processing...' : `Confirm ${tradeType}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MarketPage;