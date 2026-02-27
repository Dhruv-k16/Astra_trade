import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Lock, Mail, User, Eye, EyeOff, Activity, X, ArrowLeft, CheckCircle } from 'lucide-react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const LoginPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Forgot password — 3 steps: 'email' | 'newpass' | 'done'
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotStep, setForgotStep] = useState('email');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotUsername, setForgotUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  const { login, register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        await login(email, password);
        toast.success('Welcome back!');
      } else {
        await register(username, email, password);
        toast.success('Account created successfully!');
      }
      navigate('/dashboard');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const closeForgotModal = () => {
    setShowForgotModal(false);
    setForgotStep('email');
    setForgotEmail('');
    setForgotUsername('');
    setNewPassword('');
    setConfirmPassword('');
    setShowNewPassword(false);
  };

  // Step 1 — verify email exists
  const handleVerifyEmail = async (e) => {
    e.preventDefault();
    setForgotLoading(true);
    try {
      const res = await axios.post(`${API}/auth/verify-email`, { email: forgotEmail });
      setForgotUsername(res.data.username);
      setForgotStep('newpass');
    } catch (error) {
      const msg = error.response?.data?.detail || 'Email verification failed';
      toast.error(msg);
    } finally {
      setForgotLoading(false);
    }
  };

  // Step 2 — set new password
  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return; }

    setForgotLoading(true);
    try {
      await axios.post(`${API}/auth/reset-password-direct`, {
        email: forgotEmail,
        new_password: newPassword
      });
      setForgotStep('done');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to reset password');
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-600/5 rounded-full blur-3xl"></div>
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-600 mb-4 shadow-lg">
            <Activity className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent mb-2">
            AstraEdge
          </h1>
          <p className="text-slate-400">
            {isLogin ? 'Welcome back to the competition' : 'Join the ultimate trading challenge'}
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-8 shadow-modern-lg">
          {/* Toggle */}
          <div className="flex bg-slate-800 rounded-lg p-1 mb-6">
            <button
              data-testid="login-tab"
              onClick={() => setIsLogin(true)}
              className={`flex-1 py-2.5 px-4 rounded-lg font-medium transition-all ${isLogin ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'
                }`}
            >
              Login
            </button>
            <button
              data-testid="register-tab"
              onClick={() => setIsLogin(false)}
              className={`flex-1 py-2.5 px-4 rounded-lg font-medium transition-all ${!isLogin ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'
                }`}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Username</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <input
                    data-testid="username-input"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                    placeholder="Enter your username"
                    required
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  data-testid="email-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                  placeholder="Enter your email"
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-slate-300">Password</label>
                {isLogin && (
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(true)}
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  data-testid="password-input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-12 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              data-testid="submit-button"
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg active:scale-[0.98]"
            >
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Please wait...</span>
                </div>
              ) : (
                isLogin ? 'Login to Dashboard' : 'Create Account'
              )}
            </button>
          </form>

          {/* Disclaimer */}
          <div className="mt-6 p-4 bg-slate-800/50 border border-slate-700 rounded-lg">
            <p className="text-xs text-slate-400 text-center">
              <span className="text-amber-400 font-medium">⚠️ Simulated Environment</span>
              <br />
              Educational purpose only. No real money transactions involved.
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-8 grid grid-cols-3 gap-4 text-center">
          <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
            <div className="text-2xl font-bold text-gradient-primary font-mono">₹10L</div>
            <div className="text-xs text-slate-400 mt-1">Starting Capital</div>
          </div>
          <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
            <div className="text-2xl font-bold text-gradient-primary font-mono">5-6</div>
            <div className="text-xs text-slate-400 mt-1">Days Contest</div>
          </div>
          <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
            <div className="text-2xl font-bold text-gradient-primary font-mono">NSE/BSE/MCX</div>
            <div className="text-xs text-slate-400 mt-1">Live Data</div>
          </div>
        </div>
      </div>

      {/* ===== FORGOT PASSWORD MODAL ===== */}
      {showForgotModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) closeForgotModal(); }}
        >
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-sm p-6 shadow-2xl">

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                {forgotStep === 'newpass' && (
                  <button
                    onClick={() => setForgotStep('email')}
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                )}
                <h2 className="text-xl font-bold text-white">
                  {forgotStep === 'email' && 'Forgot Password'}
                  {forgotStep === 'newpass' && 'Set New Password'}
                  {forgotStep === 'done' && 'Password Updated'}
                </h2>
              </div>
              {forgotStep !== 'done' && (
                <button
                  onClick={closeForgotModal}
                  className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Step indicators */}
            {forgotStep !== 'done' && (
              <div className="flex items-center gap-2 mb-6">
                <div className={`flex items-center gap-1.5 text-xs font-medium ${forgotStep === 'email' ? 'text-blue-400' : 'text-emerald-400'}`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${forgotStep === 'email' ? 'bg-blue-500/20 border border-blue-500' : 'bg-emerald-500/20 border border-emerald-500'}`}>
                    {forgotStep === 'email' ? '1' : '✓'}
                  </div>
                  Verify Email
                </div>
                <div className={`flex-1 h-px ${forgotStep === 'newpass' ? 'bg-blue-500/50' : 'bg-slate-700'}`}></div>
                <div className={`flex items-center gap-1.5 text-xs font-medium ${forgotStep === 'newpass' ? 'text-blue-400' : 'text-slate-500'}`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${forgotStep === 'newpass' ? 'bg-blue-500/20 border border-blue-500' : 'bg-slate-700 border border-slate-600'}`}>
                    2
                  </div>
                  New Password
                </div>
              </div>
            )}

            {/* ---- STEP 1: Enter email ---- */}
            {forgotStep === 'email' && (
              <>
                <p className="text-slate-400 text-sm mb-5">
                  Enter your registered email address to verify your account.
                </p>
                <form onSubmit={handleVerifyEmail} className="space-y-4">
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                      placeholder="your@email.com"
                      required
                      autoFocus
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg font-medium transition-all disabled:opacity-50 shadow-lg"
                  >
                    {forgotLoading ? (
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        <span>Verifying...</span>
                      </div>
                    ) : 'Verify Email'}
                  </button>
                </form>
              </>
            )}

            {/* ---- STEP 2: Set new password ---- */}
            {forgotStep === 'newpass' && (
              <>
                <div className="flex items-center gap-2 mb-5 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                  <p className="text-emerald-400 text-sm">
                    Verified as <span className="font-semibold">{forgotUsername}</span>
                  </p>
                </div>
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">New Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full pl-10 pr-12 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                        placeholder="Min. 6 characters"
                        required
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                      >
                        {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Confirm Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                        placeholder="Repeat new password"
                        required
                      />
                    </div>
                    {confirmPassword && (
                      <p className={`text-xs mt-1.5 ${newPassword === confirmPassword ? 'text-emerald-400' : 'text-red-400'}`}>
                        {newPassword === confirmPassword ? '✓ Passwords match' : '✗ Passwords do not match'}
                      </p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={forgotLoading || newPassword !== confirmPassword || newPassword.length < 6}
                    className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                  >
                    {forgotLoading ? (
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        <span>Updating...</span>
                      </div>
                    ) : 'Update Password'}
                  </button>
                </form>
              </>
            )}

            {/* ---- STEP 3: Success ---- */}
            {forgotStep === 'done' && (
              <div className="text-center py-2">
                <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-emerald-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Password Updated!</h3>
                <p className="text-slate-400 text-sm mb-6">
                  Your password has been changed successfully. You can now login with your new password.
                </p>
                <button
                  onClick={closeForgotModal}
                  className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg font-medium transition-all shadow-lg"
                >
                  Back to Login
                </button>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
};

export default LoginPage;