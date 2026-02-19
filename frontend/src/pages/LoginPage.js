import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { TrendingUp, Lock, Mail, User, Eye, EyeOff } from 'lucide-react';

const LoginPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  
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

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Login Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md space-y-8">
          {/* Logo */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
              <TrendingUp className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-4xl font-bold tracking-tight" data-testid="login-title">Campus Trading</h1>
            <p className="text-muted-foreground mt-2">Join the ultimate college trading competition</p>
          </div>

          {/* Toggle */}
          <div className="flex border border-border rounded-lg p-1 bg-muted/30">
            <button
              data-testid="login-tab"
              onClick={() => setIsLogin(true)}
              className={`flex-1 py-2 px-4 rounded-md font-medium transition-all ${
                isLogin
                  ? 'bg-card shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Login
            </button>
            <button
              data-testid="register-tab"
              onClick={() => setIsLogin(false)}
              className={`flex-1 py-2 px-4 rounded-md font-medium transition-all ${
                !isLogin
                  ? 'bg-card shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Register
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium mb-2">Username</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    data-testid="username-input"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-border rounded-lg bg-card focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                    placeholder="Enter your username"
                    required
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  data-testid="email-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-border rounded-lg bg-card focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                  placeholder="Enter your email"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  data-testid="password-input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-12 py-3 border border-border rounded-lg bg-card focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              data-testid="submit-button"
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
            >
              {loading ? 'Please wait...' : isLogin ? 'Login' : 'Create Account'}
            </button>
          </form>

          {/* Disclaimer */}
          <div className="text-xs text-muted-foreground text-center p-4 bg-muted/30 rounded-lg">
            This is a simulated trading environment created for educational purposes. No real money transactions are involved.
          </div>

          {/* Demo Credentials */}
          <div className="text-center text-sm text-muted-foreground">
            <p>Admin Login: admin@campus.edu / Admin@123</p>
          </div>
        </div>
      </div>

      {/* Right Side - Hero Image */}
      <div 
        className="hidden lg:flex flex-1 bg-cover bg-center relative"
        style={{ backgroundImage: 'url(https://images.pexels.com/photos/28428592/pexels-photo-28428592.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940)' }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-primary/80 to-primary/40" />
        <div className="relative z-10 flex flex-col items-center justify-center text-white p-12 text-center">
          <h2 className="text-5xl font-bold mb-4">Trade. Compete. Win.</h2>
          <p className="text-xl text-white/90 max-w-md">
            Experience real market dynamics in a risk-free environment. Compete with peers and climb the leaderboard.
          </p>
          <div className="mt-12 grid grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-4xl font-bold font-mono">₹10L</div>
              <div className="text-sm text-white/80 mt-1">Starting Capital</div>
            </div>
            <div>
              <div className="text-4xl font-bold font-mono">5-6</div>
              <div className="text-sm text-white/80 mt-1">Days Contest</div>
            </div>
            <div>
              <div className="text-4xl font-bold font-mono">NSE</div>
              <div className="text-sm text-white/80 mt-1">Real Data</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;