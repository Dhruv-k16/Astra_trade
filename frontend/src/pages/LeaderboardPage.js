import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Trophy, Medal, Award, TrendingUp } from 'lucide-react';

const LeaderboardPage = () => {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);

  const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

  useEffect(() => {
    fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchLeaderboard = async () => {
    try {
      const response = await axios.get(`${API}/leaderboard`);
      setLeaderboard(response.data);
    } catch (error) {
      console.error('Failed to fetch leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRankBadge = (rank) => {
    if (rank === 1) {
      return <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center"><Trophy className="w-6 h-6 text-yellow-500" /></div>;
    } else if (rank === 2) {
      return <div className="w-10 h-10 rounded-full bg-gray-400/20 flex items-center justify-center"><Medal className="w-6 h-6 text-gray-400" /></div>;
    } else if (rank === 3) {
      return <div className="w-10 h-10 rounded-full bg-orange-600/20 flex items-center justify-center"><Award className="w-6 h-6 text-orange-600" /></div>;
    }
    return <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center font-bold text-muted-foreground">#{rank}</div>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6" data-testid="leaderboard-page">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-yellow-500/10 mb-4">
          <Trophy className="w-8 h-8 text-yellow-500" />
        </div>
        <h1 className="text-4xl font-bold">Leaderboard</h1>
        <p className="text-muted-foreground mt-2">Top performers in the trading contest</p>
      </div>

      {leaderboard.length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-xl">
          <TrendingUp className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">No participants yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {leaderboard.map((entry) => {
            const returnPositive = entry.return_percentage >= 0;
            const isTopThree = entry.rank <= 3;
            
            return (
              <div
                key={entry.rank}
                data-testid={`leaderboard-entry-${entry.rank}`}
                className={`flex items-center justify-between p-6 rounded-xl transition-all ${
                  isTopThree
                    ? 'bg-gradient-to-r from-card to-primary/5 border-2 border-primary/20 shadow-lg'
                    : 'bg-card border border-border hover:shadow-md'
                }`}
              >
                <div className="flex items-center space-x-4">
                  {getRankBadge(entry.rank)}
                  <div>
                    <div className="text-lg font-bold">{entry.username}</div>
                    <div className="text-sm text-muted-foreground">{entry.trade_count} trades</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold font-mono tabular-nums">
                    ₹{entry.portfolio_value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                  <div className={`text-lg font-semibold font-mono flex items-center justify-end gap-1 ${
                    returnPositive ? 'text-gain' : 'text-loss'
                  }`}>
                    {returnPositive ? '▲' : '▼'} {returnPositive ? '+' : ''}{entry.return_percentage.toFixed(2)}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LeaderboardPage;