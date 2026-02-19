import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Users, Plus, Trash2, Lock, Unlock } from 'lucide-react';
import { toast } from 'sonner';

const AdminPage = () => {
  const { token, user } = useAuth();
  const [users, setUsers] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', email: '', password: '', role: 'user' });
  const [loading, setLoading] = useState(false);

  const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchUsers();
    }
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${API}/admin/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers(response.data.users);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };

  const createUser = async () => {
    if (!newUser.username || !newUser.email || !newUser.password) {
      toast.error('Please fill all fields');
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API}/admin/users`, newUser, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('User created successfully');
      setShowCreateModal(false);
      setNewUser({ username: '', email: '', password: '', role: 'user' });
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  const deleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;

    try {
      await axios.delete(`${API}/admin/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('User deleted successfully');
      fetchUsers();
    } catch (error) {
      toast.error('Failed to delete user');
    }
  };

  const toggleTrading = async (freeze) => {
    try {
      await axios.post(
        `${API}/admin/contest/${freeze ? 'freeze' : 'unfreeze'}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(`Trading ${freeze ? 'frozen' : 'unfrozen'} successfully`);
    } catch (error) {
      toast.error('Failed to toggle trading status');
    }
  };

  if (user?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Lock className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-2xl font-bold">Access Denied</h2>
          <p className="text-muted-foreground mt-2">You don't have permission to access this page</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6" data-testid="admin-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-white">Admin Dashboard</h1>
          <p className="text-slate-400 mt-2">Manage users and contest settings</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          data-testid="create-user-button"
          className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg transition-all active:scale-95 shadow-lg"
        >
          <Plus className="w-5 h-5" />
          <span>Create User</span>
        </button>
      </div>

      {/* Contest Controls */}
      <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-6 shadow-modern">
        <h2 className="text-xl font-semibold text-white mb-4">Contest Controls</h2>
        <div className="flex space-x-3">
          <button
            onClick={() => toggleTrading(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-red-500 hover:bg-red-400 text-white rounded-lg transition-all shadow-lg"
          >
            <Lock className="w-4 h-4" />
            <span>Freeze Trading</span>
          </button>
          <button
            onClick={() => toggleTrading(false)}
            className="flex items-center space-x-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg transition-all shadow-lg"
          >
            <Unlock className="w-4 h-4" />
            <span>Unfreeze Trading</span>
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl overflow-hidden shadow-modern">
        <div className="p-6 border-b border-slate-700/50">
          <h2 className="text-xl font-semibold text-white">All Users ({users.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-800/50">
              <tr>
                <th className="text-left p-4 font-semibold text-slate-300">Username</th>
                <th className="text-left p-4 font-semibold text-slate-300">Email</th>
                <th className="text-left p-4 font-semibold text-slate-300">Role</th>
                <th className="text-right p-4 font-semibold text-slate-300">Balance</th>
                <th className="text-right p-4 font-semibold text-slate-300">Trades</th>
                <th className="text-right p-4 font-semibold text-slate-300">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-slate-700/50 hover:bg-slate-800/30 transition-colors">
                  <td className="p-4 font-medium text-white">{u.username}</td>
                  <td className="p-4 text-slate-400">{u.email}</td>
                  <td className="p-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      u.role === 'admin' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-slate-700/50 text-slate-300 border border-slate-600'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="p-4 text-right font-mono text-slate-300">₹{u.virtual_balance.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                  <td className="p-4 text-right font-mono text-slate-300">{u.trade_count}</td>
                  <td className="p-4 text-right">
                    {u.role !== 'admin' && (
                      <button
                        onClick={() => deleteUser(u.id)}
                        className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-6 shadow-modern-lg">
            <h2 className="text-2xl font-bold mb-4 text-white">Create New User</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Username</label>
                <input
                  type="text"
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                  placeholder="Enter username"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                  placeholder="Enter email"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                  placeholder="Enter password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Role</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 py-3 border border-slate-700 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-all font-medium"
              >
                Cancel
              </button>
              <button
                onClick={createUser}
                disabled={loading}
                className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg transition-all disabled:opacity-50 font-medium shadow-lg"
              >
                {loading ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPage;