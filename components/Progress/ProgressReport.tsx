import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { ReadingSession, User } from '../../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from 'recharts';
import { Calendar, TrendingUp, Award, Zap, Clock } from 'lucide-react';

interface ProgressReportProps {
  user: User;
}

const ProgressReport: React.FC<ProgressReportProps> = ({ user }) => {
  const [sessions, setSessions] = useState<ReadingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'all' | 'week'>('week');

  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await api.getSessions(user.username);
        // Sort by timestamp
        data.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        setSessions(data);
      } catch (e) {
        console.error("Failed to load sessions", e);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [user]);

  // Calculations
  const totalWords = sessions.reduce((acc, curr) => acc + curr.wordsRead, 0);
  const avgAccuracy = sessions.length > 0 
    ? Math.round(sessions.reduce((acc, curr) => acc + curr.accuracy, 0) / sessions.length) 
    : 0;
  
  // Chart Data Preparation
  const getChartData = () => {
    let filtered = sessions;
    if (timeRange === 'week') {
      const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      filtered = sessions.filter(s => (s.timestamp || 0) > oneWeekAgo);
    }

    return filtered.map(s => ({
      date: s.date,
      words: s.wordsRead,
      accuracy: s.accuracy,
      stars: s.stars
    }));
  };

  const chartData = getChartData();

  if (loading) return <div className="p-8 text-center text-slate-400 font-bold">Loading your reading power...</div>;

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-blue-100">
           <div className="flex items-center gap-3 mb-2 text-blue-500">
             <Award />
             <span className="font-bold text-sm uppercase">Total Stars</span>
           </div>
           <div className="text-3xl font-black text-slate-800">{user.totalStars}</div>
        </div>
        
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-purple-100">
           <div className="flex items-center gap-3 mb-2 text-purple-500">
             <Zap />
             <span className="font-bold text-sm uppercase">Current Streak</span>
           </div>
           <div className="text-3xl font-black text-slate-800">{user.streak} <span className="text-sm text-slate-400 font-normal">days</span></div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-green-100">
           <div className="flex items-center gap-3 mb-2 text-green-500">
             <TrendingUp />
             <span className="font-bold text-sm uppercase">Avg. Accuracy</span>
           </div>
           <div className="text-3xl font-black text-slate-800">{avgAccuracy}%</div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-orange-100">
           <div className="flex items-center gap-3 mb-2 text-orange-500">
             <Clock />
             <span className="font-bold text-sm uppercase">Words Read</span>
           </div>
           <div className="text-3xl font-black text-slate-800">{totalWords}</div>
        </div>
      </div>

      {/* Interactive Charts Area */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-8">
           <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
             <Calendar className="text-blue-500"/> Reading History
           </h3>
           <div className="flex bg-slate-100 p-1 rounded-lg">
              <button 
                onClick={() => setTimeRange('week')}
                className={`px-4 py-1 rounded-md text-sm font-bold transition ${timeRange === 'week' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
              >
                Last 7 Days
              </button>
              <button 
                onClick={() => setTimeRange('all')}
                className={`px-4 py-1 rounded-md text-sm font-bold transition ${timeRange === 'all' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
              >
                All Time
              </button>
           </div>
        </div>

        {sessions.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-slate-400 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
            <TrendingUp size={48} className="mb-4 opacity-50"/>
            <p className="font-bold">No reading data yet!</p>
            <p className="text-sm">Read a story to see your stats grow.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Chart 1: Words Read */}
            <div className="h-80 w-full">
               <h4 className="text-center font-bold text-slate-500 mb-4">Words Read</h4>
               <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip 
                      cursor={{fill: '#f8fafc'}}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Legend />
                    <Bar name="Words" dataKey="words" fill="#818cf8" radius={[6, 6, 0, 0]} />
                 </BarChart>
               </ResponsiveContainer>
            </div>

            {/* Chart 2: Accuracy Trend */}
            <div className="h-80 w-full">
               <h4 className="text-center font-bold text-slate-500 mb-4">Accuracy Trend (%)</h4>
               <ResponsiveContainer width="100%" height="100%">
                 <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Legend />
                    <Line name="Accuracy" type="monotone" dataKey="accuracy" stroke="#10b981" strokeWidth={3} dot={{r: 4, fill: '#10b981'}} activeDot={{r: 6}} />
                 </LineChart>
               </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Detailed Session List */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
         <div className="p-6 border-b border-slate-100">
            <h3 className="text-lg font-bold text-slate-800">Recent Sessions</h3>
         </div>
         <div className="max-h-96 overflow-y-auto">
            {sessions.slice().reverse().map((session, idx) => (
              <div key={idx} className="flex items-center justify-between p-4 border-b border-slate-50 hover:bg-slate-50 transition">
                 <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 font-bold">
                       {session.accuracy}%
                    </div>
                    <div>
                       <div className="font-bold text-slate-700">{session.date}</div>
                       <div className="text-xs text-slate-400">{session.wordsRead} words read</div>
                    </div>
                 </div>
                 <div className="flex gap-1">
                    {'★'.repeat(session.stars)}
                    <span className="text-slate-200">{'★'.repeat(5 - session.stars)}</span>
                 </div>
              </div>
            ))}
            {sessions.length === 0 && (
              <div className="p-8 text-center text-slate-400">No sessions recorded yet.</div>
            )}
         </div>
      </div>

    </div>
  );
};

export default ProgressReport;