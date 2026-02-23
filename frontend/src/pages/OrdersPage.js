import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { FileText, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { toast } from 'sonner';
import { usePriceWebSocket } from '../hooks/usePriceWebSocket';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const OrdersPage = () => {
  const { token } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // Trade modal state
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [tradeType, setTradeType] = useState('BUY');
  const [quantity, setQuantity] = useState('');
  const [tradeLoading, setTradeLoading] = useState(false);

  const { prices, subscribe } = usePriceWebSocket();

  useEffect(() => {
    fetchOrders();
  }, []);

  // Subscribe to all unique instrument keys from order history
  useEffect(() => {
    if (!orders.length) return;
    const keys = [...new Set(orders.map(o => o.instrument_key).filter(Boolean))];
    subscribe(keys);
  }, [orders]);

  const fetchOrders = async () => {
    try {
      const response = await axios.get(`${API}/orders`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setOrders(response.data.orders);
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const getLivePrice = (instrumentKey) => prices[instrumentKey]?.last_price || null;

  const openTradeModal = (order, type) => {
    setSelectedOrder(order);
    setTradeType(type);
    setQuantity('');
    setShowTradeModal(true);
  };

  const totalAmount = () => {
    if (!quantity || !selectedOrder) return null;
    const price = getLivePrice(selectedOrder.instrument_key) || selectedOrder.price;
    const total = price * parseInt(quantity);
    return isNaN(total) ? null : total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const executeTrade = async () => {
    if (!quantity || parseInt(quantity) <= 0) { toast.error('Enter a valid quantity'); return; }
    const livePrice = getLivePrice(selectedOrder.instrument_key);
    if (!livePrice) { toast.error('No live price available. Markets may be closed.'); return; }

    setTradeLoading(true);
    try {
      await axios.post(`${API}/trade`, {
        instrument_key: selectedOrder.instrument_key,
        trading_symbol: selectedOrder.trading_symbol,
        quantity: parseInt(quantity),
        trade_type: tradeType
      }, { headers: { Authorization: `Bearer ${token}` } });

      toast.success(`${tradeType === 'BUY' ? '🟢 Bought' : '🔴 Sold'} ${quantity} × ${selectedOrder.trading_symbol} @ ₹${livePrice.toFixed(2)}`);
      setShowTradeModal(false);
      fetchOrders();
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

  // Get unique stocks from order history for quick trade
  const uniqueStocks = [...new Map(orders.map(o => [o.instrument_key, o])).values()];

  return (
    <div className="p-4 md:p-8 space-y-6" data-testid="orders-page">
      <div>
        <h1 className="text-4xl font-bold">Order History</h1>
        <p className="text-muted-foreground mt-2">View all your executed trades</p>
      </div>

      {/* Quick Trade Panel — stocks you've traded before */}
      {uniqueStocks.length > 0 && (
        <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Quick Trade — Your Stocks</h2>
          <div className="flex flex-wrap gap-2">
            {uniqueStocks.map((order) => {
              const lp = getLivePrice(order.instrument_key);
              return (
                <div key={order.instrument_key} className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2">
                  <div>
                    <span className="text-white font-semibold text-sm">{order.trading_symbol}</span>
                    {lp && (
                      <span className="text-slate-400 text-xs ml-2 font-mono">₹{lp.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    )}
                  </div>
                  <button
                    onClick={() => openTradeModal(order, 'BUY')}
                    className="px-2 py-1 bg-emerald-600/20 hover:bg-emerald-600 border border-emerald-600/40 text-emerald-400 hover:text-white rounded text-xs font-semibold transition-all"
                  >
                    Buy
                  </button>
                  <button
                    onClick={() => openTradeModal(order, 'SELL')}
                    className="px-2 py-1 bg-red-600/20 hover:bg-red-600 border border-red-600/40 text-red-400 hover:text-white rounded text-xs font-semibold transition-all"
                  >
                    Sell
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Orders Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {orders.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No orders yet. Start trading to see your order history.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-4 font-semibold">Date & Time</th>
                  <th className="text-left p-4 font-semibold">Type</th>
                  <th className="text-left p-4 font-semibold">Symbol</th>
                  <th className="text-right p-4 font-semibold">Qty</th>
                  <th className="text-right p-4 font-semibold">Exec. Price</th>
                  <th className="text-right p-4 font-semibold">Live Price</th>
                  <th className="text-right p-4 font-semibold">Total Amount</th>
                  <th className="text-center p-4 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const isBuy = order.trade_type === 'BUY';
                  const lp = getLivePrice(order.instrument_key);
                  return (
                    <tr key={order.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                      <td className="p-4 text-sm">
                        {new Date(order.timestamp).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="p-4">
                        <div className={`inline-flex items-center space-x-2 px-3 py-1 rounded-full font-medium text-sm ${
                          isBuy ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                        }`}>
                          {isBuy ? <ArrowUpCircle className="w-4 h-4" /> : <ArrowDownCircle className="w-4 h-4" />}
                          <span>{order.trade_type}</span>
                        </div>
                      </td>
                      <td className="p-4 font-semibold">{order.trading_symbol}</td>
                      <td className="p-4 text-right font-mono">{order.quantity}</td>
                      <td className="p-4 text-right font-mono">₹{order.price.toFixed(2)}</td>
                      <td className="p-4 text-right font-mono">
                        {lp ? (
                          <span className="text-white">
                            ₹{lp.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            <span className="ml-1 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block"></span>
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="p-4 text-right font-mono font-semibold">
                        ₹{order.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex gap-1.5 justify-center">
                          <button
                            onClick={() => openTradeModal(order, 'BUY')}
                            className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600 border border-emerald-600/40 text-emerald-400 hover:text-white rounded text-xs font-semibold transition-all"
                          >
                            Buy
                          </button>
                          <button
                            onClick={() => openTradeModal(order, 'SELL')}
                            className="px-2.5 py-1 bg-red-600/20 hover:bg-red-600 border border-red-600/40 text-red-400 hover:text-white rounded text-xs font-semibold transition-all"
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
      {showTradeModal && selectedOrder && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowTradeModal(false); }}
        >
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-white">
                  {tradeType === 'BUY' ? '🟢 Buy' : '🔴 Sell'} {selectedOrder.trading_symbol}
                </h2>
                <p className="text-sm text-slate-400 mt-0.5">
                  Last executed @ ₹{selectedOrder.price.toFixed(2)}
                </p>
              </div>
              <button onClick={() => setShowTradeModal(false)} className="text-slate-400 hover:text-white transition-colors text-2xl leading-none">×</button>
            </div>

            <div className="space-y-4">
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
                <div className="text-sm text-slate-400 mb-1">Live Market Price</div>
                {getLivePrice(selectedOrder.instrument_key) ? (
                  <div className="flex items-baseline gap-3">
                    <span className="text-3xl font-bold font-mono text-white">
                      ₹{getLivePrice(selectedOrder.instrument_key).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                      <span className="text-xs text-slate-500">Live</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-500">Markets may be closed. No live price available.</div>
                )}
              </div>

              <div>
                <label className="text-sm font-medium text-slate-300 mb-2 block">Quantity</label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  min="1"
                  step="1"
                  placeholder="Number of shares..."
                  autoFocus
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-lg"
                />
              </div>

              {totalAmount() && (
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Price per share</span>
                    <span className="text-white font-mono">₹{(getLivePrice(selectedOrder.instrument_key) || selectedOrder.price).toFixed(2)}</span>
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
                disabled={tradeLoading || !getLivePrice(selectedOrder.instrument_key)}
                className={`flex-1 py-3 px-4 rounded-xl text-white font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg ${
                  tradeType === 'BUY' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'
                }`}
              >
                {tradeLoading ? 'Processing...' : !getLivePrice(selectedOrder.instrument_key) ? 'No Live Price' : `Confirm ${tradeType} ${tradeType === 'BUY' ? '▲' : '▼'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrdersPage;