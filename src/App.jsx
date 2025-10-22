import React, { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444'];

export default function ReceiptAnalytics() {
  const [receipts, setReceipts] = useState([]);
  const [timeFilter, setTimeFilter] = useState('all');

  useEffect(() => {
    const stored = localStorage.getItem('receipt_data');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setReceipts(parsed);
      } catch (e) {
        console.error('failed to parse stored receipts:', e);
      }
    }
  }, []);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const parsed = JSON.parse(text);
      setReceipts(parsed);
      localStorage.setItem('receipt_data', text);
    } catch (e) {
      alert('failed to paste - make sure you copied valid receipt data');
    }
  };

  const handleClear = () => {
    localStorage.removeItem('receipt_data');
    setReceipts([]);
  };

  const filteredReceipts = timeFilter === '24h' 
    ? receipts.filter(r => {
        try {
          const dateStr = r.date.replace(/\s+/g, ' ').trim();
          const now = new Date();
          const currentYear = now.getFullYear();
          const receiptDate = new Date(`${dateStr} ${currentYear}`);
          const hoursDiff = (now - receiptDate) / (1000 * 60 * 60);
          return hoursDiff <= 24 && hoursDiff >= 0;
        } catch {
          return true;
        }
      })
    : receipts;

  const parseReceiptDate = (dateStr) => {
    try {
      const match = dateStr.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d+)\s+(\d+):(\d+)\s+(AM|PM)/);
      if (!match) return null;
      
      const monthMap = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
      const month = monthMap[match[1]];
      const day = parseInt(match[2]);
      let hour = parseInt(match[3]);
      const minute = parseInt(match[4]);
      const isPM = match[5] === 'PM';
      
      if (isPM && hour !== 12) hour += 12;
      if (!isPM && hour === 12) hour = 0;
      
      const now = new Date();
      const date = new Date(now.getFullYear(), month, day, hour, minute);
      
      // if date is in future, assume it's from last year
      if (date > now) {
        date.setFullYear(now.getFullYear() - 1);
      }
      
      return date;
    } catch {
      return null;
    }
  };

  const getDateRange = () => {
    if (filteredReceipts.length === 0) return '';
    const dates = filteredReceipts.map(r => parseReceiptDate(r.date)).filter(d => d);
    
    if (dates.length === 0) return '';
    const oldest = new Date(Math.min(...dates));
    const newest = new Date(Math.max(...dates));
    return `${oldest.toLocaleDateString()} - ${newest.toLocaleDateString()}`;
  };

  const totalCoins = filteredReceipts.reduce((sum, r) => sum + r.coins, 0);
  const avgCoins = filteredReceipts.length ? (totalCoins / filteredReceipts.length).toFixed(1) : 0;
  
  const conceptStats = filteredReceipts.reduce((acc, r) => {
    if (r.concept) {
      acc[r.concept] = (acc[r.concept] || 0) + r.coins;
    }
    return acc;
  }, {});
  
  const conceptData = Object.entries(conceptStats)
    .map(([name, coins]) => ({ name, coins }))
    .sort((a, b) => b.coins - a.coins);
  
  const userStats = filteredReceipts.reduce((acc, r) => {
    if (r.user !== 'you') {
      acc[r.user] = (acc[r.user] || 0) + 1;
    }
    return acc;
  }, {});
  
  const topUsers = Object.entries(userStats)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const userValueStats = filteredReceipts.reduce((acc, r) => {
    if (r.user !== 'you') {
      acc[r.user] = (acc[r.user] || 0) + r.coins;
    }
    return acc;
  }, {});

  const topValueUsers = Object.entries(userValueStats)
    .map(([name, coins]) => ({ name, coins }))
    .sort((a, b) => b.coins - a.coins)
    .slice(0, 10);
  
  const actionStats = filteredReceipts.reduce((acc, r) => {
    acc[r.action] = (acc[r.action] || 0) + 1;
    return acc;
  }, {});
  
  const actionData = Object.entries(actionStats)
    .map(([name, value]) => ({ name, value }));

  const timeOfDayStats = filteredReceipts.reduce((acc, r) => {
    try {
      const timeMatch = r.date.match(/(\d+):(\d+)\s+(AM|PM)/);
      if (timeMatch) {
        let hour = parseInt(timeMatch[1]);
        const isPM = timeMatch[3] === 'PM';
        if (isPM && hour !== 12) hour += 12;
        if (!isPM && hour === 12) hour = 0;
        acc[hour] = (acc[hour] || 0) + r.coins;
      }
    } catch {}
    return acc;
  }, {});

  const timeOfDayData = Object.entries(timeOfDayStats)
    .map(([hour, coins]) => ({
      hour: `${hour}:00`,
      coins
    }))
    .sort((a, b) => parseInt(a.hour) - parseInt(b.hour));
  
  const coinFlow = filteredReceipts
    .slice()
    .reverse()
    .reduce((acc, r, i) => {
      const prev = acc[i - 1]?.total || 0;
      acc.push({ 
        index: i, 
        coins: r.coins,
        total: prev + r.coins,
        label: `${i}`
      });
      return acc;
    }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-green-900 to-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-green-400 mb-2">receipt analytics</h1>
          <div className="flex items-center gap-4 flex-wrap">
            <p className="text-gray-400">
              {receipts.length > 0 
                ? `showing ${filteredReceipts.length} of ${receipts.length} receipts`
                : 'no data yet - run the bookmarklet on your receipts page'}
            </p>
            {receipts.length > 0 && (
              <>
                <div className="flex gap-2">
                  <button
                    onClick={() => setTimeFilter('all')}
                    className={`px-4 py-1 rounded ${timeFilter === 'all' ? 'bg-green-600' : 'bg-gray-700'} text-white text-sm transition-colors`}
                  >
                    all time
                  </button>
                  <button
                    onClick={() => setTimeFilter('24h')}
                    className={`px-4 py-1 rounded ${timeFilter === '24h' ? 'bg-green-600' : 'bg-gray-700'} text-white text-sm transition-colors`}
                  >
                    last 24h
                  </button>
                </div>
                <p className="text-gray-500 text-sm ml-auto">
                  {getDateRange()}
                </p>
              </>
            )}
          </div>
        </div>

        {receipts.length === 0 && (
          <div className="bg-gray-800 rounded-lg p-12 border border-gray-700 text-center">
            <p className="text-gray-400 text-lg mb-4">waiting for data...</p>
            <p className="text-gray-500 text-sm mb-6">
              run bookmarklet on receipts page to copy data, then click below
            </p>
            <button
              onClick={handlePaste}
              className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
            >
              paste receipt data
            </button>
          </div>
        )}

        {receipts.length > 0 && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <p className="text-gray-400 text-sm mb-1">total coins</p>
                <p className={`text-3xl font-bold ${totalCoins >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {totalCoins > 0 ? '+' : ''}{totalCoins}¢
                </p>
              </div>
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <p className="text-gray-400 text-sm mb-1">avg per action</p>
                <p className="text-3xl font-bold text-blue-400">{avgCoins}¢</p>
              </div>
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <p className="text-gray-400 text-sm mb-1">total actions</p>
                <p className="text-3xl font-bold text-purple-400">{filteredReceipts.length}</p>
              </div>
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <p className="text-gray-400 text-sm mb-1">unique users</p>
                <p className="text-3xl font-bold text-yellow-400">{Object.keys(userStats).length}</p>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-6 mb-8 border border-gray-700">
              <h2 className="text-xl font-bold text-green-400 mb-4">cumulative coin flow</h2>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={coinFlow}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="label" stroke="#9ca3af" />
                  <YAxis stroke="#9ca3af" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                    labelStyle={{ color: '#9ca3af' }}
                  />
                  <Line type="monotone" dataKey="total" stroke="#10b981" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="coins" stroke="#3b82f6" strokeWidth={1} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
              {conceptData.length > 0 && (
                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                  <h2 className="text-xl font-bold text-green-400 mb-4">concept roi</h2>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={conceptData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="name" stroke="#9ca3af" angle={-45} textAnchor="end" height={100} />
                      <YAxis stroke="#9ca3af" />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                      />
                      <Bar dataKey="coins" fill="#10b981" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {timeOfDayData.length > 0 && (
                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                  <h2 className="text-xl font-bold text-green-400 mb-4">best time to post</h2>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={timeOfDayData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="hour" stroke="#9ca3af" />
                      <YAxis stroke="#9ca3af" />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                      />
                      <Bar dataKey="coins" fill="#f59e0b" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
              {topUsers.length > 0 && (
                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                  <h2 className="text-xl font-bold text-green-400 mb-4">most active users</h2>
                  <div className="space-y-3">
                    {topUsers.map((user, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
                            {i + 1}
                          </div>
                          <span className="text-gray-300">{user.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-32 bg-gray-700 rounded-full h-2">
                            <div 
                              className="bg-blue-500 h-2 rounded-full" 
                              style={{width: `${(user.count / topUsers[0].count) * 100}%`}}
                            />
                          </div>
                          <span className="text-blue-400 font-bold w-8 text-right">{user.count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {topValueUsers.length > 0 && (
                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                  <h2 className="text-xl font-bold text-green-400 mb-4">highest value users</h2>
                  <div className="space-y-3">
                    {topValueUsers.map((user, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white font-bold text-sm">
                            {i + 1}
                          </div>
                          <span className="text-gray-300">{user.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-32 bg-gray-700 rounded-full h-2">
                            <div 
                              className="bg-purple-500 h-2 rounded-full" 
                              style={{width: `${(user.coins / topValueUsers[0].coins) * 100}%`}}
                            />
                          </div>
                          <span className="text-purple-400 font-bold w-12 text-right">{user.coins}¢</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-8">
              <h2 className="text-xl font-bold text-green-400 mb-4">action breakdown</h2>
              <div className="flex justify-center">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={actionData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {actionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="text-center space-x-4">
              <button
                onClick={handlePaste}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
              >
                update data
              </button>
              <button
                onClick={handleClear}
                className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                clear all data
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}