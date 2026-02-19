import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { FileText, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';

const OrdersPage = () => {
  const { token } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

  useEffect(() => {
    fetchOrders();
  }, []);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6" data-testid="orders-page">
      <div>
        <h1 className="text-4xl font-bold">Order History</h1>
        <p className="text-muted-foreground mt-2">View all your executed trades</p>
      </div>

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
                  <th className="text-right p-4 font-semibold">Quantity</th>
                  <th className="text-right p-4 font-semibold">Price</th>
                  <th className="text-right p-4 font-semibold">Total Amount</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const isBuy = order.trade_type === 'BUY';
                  return (
                    <tr key={order.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                      <td className="p-4 text-sm">
                        {new Date(order.timestamp).toLocaleString('en-IN', {
                          dateStyle: 'short',
                          timeStyle: 'short'
                        })}
                      </td>
                      <td className="p-4">
                        <div className={`inline-flex items-center space-x-2 px-3 py-1 rounded-full font-medium text-sm ${
                          isBuy ? 'bg-gain/10 text-gain' : 'bg-loss/10 text-loss'
                        }`}>
                          {isBuy ? <ArrowUpCircle className="w-4 h-4" /> : <ArrowDownCircle className="w-4 h-4" />}
                          <span>{order.trade_type}</span>
                        </div>
                      </td>
                      <td className="p-4 font-semibold">{order.trading_symbol}</td>
                      <td className="p-4 text-right font-mono">{order.quantity}</td>
                      <td className="p-4 text-right font-mono">₹{order.price.toFixed(2)}</td>
                      <td className="p-4 text-right font-mono font-semibold">
                        ₹{order.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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

export default OrdersPage;