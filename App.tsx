import React, { useState, useEffect } from 'react';
import { AppView, FontType, UserSettings, Story, ReadingSession, User } from './types';
import { BookOpen, Gamepad2, Settings, User as UserIcon, Star, Plus, Type, Activity, Palette, Sparkles, LogOut, Image as ImageIcon, BarChart2 } from 'lucide-react';
import TextReader from './components/Reader/TextReader';
import WordMatch from './components/Games/WordMatch';
import PhonemePractice from './components/Practice/PhonemePractice';
import ProgressReport from './components/Progress/ProgressReport';
import Login from './components/Auth/Login';
import { generateStory, generateImage } from './services/gemini';
import { AuthService } from './services/auth';
import { api } from './services/api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

// Default stories with images
const DEFAULT_STORIES: Story[] = [
  {
    id: '1',
    title: 'The Space Hamster',
    content: "Hammy was not a normal hamster. He lived on a spaceship! Every morning, he would run on his wheel to power the engines. One day, the ship stopped moving. 'Oh no!' squeaked Hammy. He looked outside and saw a giant floating cheese. 'That is not a moon,' said Captain Cat. 'That is lunch!'",
    difficulty: 'Beginner',
    tags: ['Space', 'Animals'],
    imageUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&q=80'
  },
  {
    id: '2',
    title: 'The Lost Robot',
    content: "Beep was a small robot with a big heart. He loved to help people find lost things. But today, Beep was lost! He rolled down a long, winding road. He saw a blue bird. 'Hello,' said Beep. 'Do you know where the city is?' The bird chirped and flew east. Beep followed the bird, his wheels spinning fast.",
    difficulty: 'Intermediate',
    tags: ['Sci-Fi', 'Kindness'],
    imageUrl: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=800&q=80'
  }
];

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [view, setView] = useState<AppView>(AppView.DASHBOARD);
  const [loading, setLoading] = useState(true);
  
  // Consolidate stories from defaults + user custom stories
  const [displayStories, setDisplayStories] = useState<Story[]>(DEFAULT_STORIES);
  
  const [activeStory, setActiveStory] = useState<Story | null>(null);
  const [generating, setGenerating] = useState(false);
  const [dailyStats, setDailyStats] = useState<ReadingSession[]>([]);

  useEffect(() => {
    const initApp = async () => {
      try {
        // Check for valid session via API
        const sessionUser = await api.getCurrentUser();
        if (sessionUser) {
          setCurrentUser(sessionUser);
        }
      } catch (e) {
        console.error("Failed to initialize app:", e);
      } finally {
        setLoading(false);
      }
    };
    initApp();
  }, []);

  useEffect(() => {
    if (currentUser) {
      setDisplayStories([...(currentUser.customStories || []), ...DEFAULT_STORIES]);
      // Fetch fresh stats for the mini chart
      api.getSessions(currentUser.username).then(sessions => {
         // Sort and take last 7 for the mini chart
         const sorted = sessions.sort((a,b) => (a.timestamp||0) - (b.timestamp||0));
         setDailyStats(sorted.slice(-7));
      });
    }
  }, [currentUser]);

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    setView(AppView.DASHBOARD);
  };

  const handleLogout = () => {
    AuthService.logout();
    setCurrentUser(null);
    setView(AppView.DASHBOARD);
  };

  const updateSetting = async <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    if (!currentUser) return;
    const newSettings = { ...currentUser.settings, [key]: value };
    await api.updateSettings(currentUser.username, newSettings);
    // Optimistic update
    setCurrentUser({...currentUser, settings: newSettings});
  };

  const handleCreateStory = async () => {
    if (!currentUser) return;
    setGenerating(true);
    try {
      // 0. Fetch User History for Adaptive Learning
      const sessions = await api.getSessions(currentUser.username);
      const allMissedWords: string[] = [];
      sessions.forEach(s => {
         if (s.missedWords) allMissedWords.push(...s.missedWords);
      });
      // Get unique recent missed words (last 20)
      const uniqueMissed = Array.from(new Set(allMissedWords)).slice(-20);

      // 1. Generate Text with Adaptive Context
      const newStoryData = await generateStory(
        "A magical adventure with tricky words", 
        "Beginner", 
        { missedWords: uniqueMissed } // Pass history
      );
      
      // 2. Generate Image based on title
      const imageBase64 = await generateImage(`Cover art for a children's story titled "${newStoryData.title}". ${newStoryData.content.substring(0, 50)}`);
      
      const s: Story = {
        id: Date.now().toString(),
        title: newStoryData.title,
        content: newStoryData.content,
        difficulty: 'Beginner',
        tags: ['Generated', 'Adaptive'],
        imageUrl: imageBase64 ? `data:image/png;base64,${imageBase64}` : undefined
      };
      
      // 3. Save to User Profile via API
      await api.addStory(currentUser.username, s);
      
      // Update local state
      const updatedUser = { ...currentUser, customStories: [s, ...currentUser.customStories] };
      setCurrentUser(updatedUser);

    } catch (e) {
      console.error(e);
      alert("Could not generate story. Please check API Key.");
    } finally {
      setGenerating(false);
    }
  };

  const handleSessionComplete = async (stats: { score: number, words: number, missedWords?: string[] }) => {
    if (!currentUser) return;
    
    const session: ReadingSession = {
      date: new Date().toLocaleDateString('en-US', { weekday: 'short' }),
      wordsRead: stats.words,
      accuracy: 90, // Mock accuracy for now
      stars: stats.score,
      storyId: activeStory?.id,
      missedWords: stats.missedWords || []
    };

    await api.addSession(currentUser.username, session);
    
    // Refresh User Data (Streak, Stars) - Get fresh state from backend/db
    const freshUser = await api.getCurrentUser();
    if (freshUser) {
        setCurrentUser(freshUser);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  const renderDashboard = () => (
    <div className="space-y-8 animate-fade-in">
      {/* Welcome Hero */}
      <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-3xl p-8 text-white shadow-lg relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-2">
             <span className="text-4xl bg-white/20 rounded-full p-2">{currentUser.avatar}</span>
             <h1 className="text-3xl font-bold font-lexend">Hi, {currentUser.username}! 👋</h1>
          </div>
          <p className="opacity-90 pl-1">Ready to go on a reading adventure today?</p>
          <div className="mt-6 flex gap-4">
             <div className="bg-white/20 backdrop-blur rounded-xl p-4 flex items-center gap-3">
                <Star className="text-yellow-300" fill="currentColor" />
                <div>
                  <div className="text-2xl font-bold">{currentUser.totalStars}</div>
                  <div className="text-xs opacity-75">Total Stars</div>
                </div>
             </div>
             <div className="bg-white/20 backdrop-blur rounded-xl p-4 flex items-center gap-3">
                <Activity className="text-green-300" />
                <div>
                  <div className="text-2xl font-bold">{currentUser.streak}</div>
                  <div className="text-xs opacity-75">Day Streak</div>
                </div>
             </div>
          </div>
        </div>
      </div>

      {/* Library */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-slate-800 font-lexend">My Stories</h2>
          <button 
            onClick={handleCreateStory}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-full font-bold transition shadow-md"
          >
            {generating ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white"/> : <Plus size={20} />}
            New Magic Story
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayStories.map(story => (
            <button 
              key={story.id}
              onClick={() => setActiveStory(story)}
              className="bg-white rounded-2xl shadow-sm border border-slate-100 hover:shadow-xl hover:border-blue-200 transition text-left group overflow-hidden flex flex-col h-full"
            >
              {story.imageUrl ? (
                <div className="h-40 w-full overflow-hidden bg-slate-100">
                  <img src={story.imageUrl} alt={story.title} className="w-full h-full object-cover transition transform group-hover:scale-105 duration-500" />
                </div>
              ) : (
                <div className="h-24 w-full bg-gradient-to-r from-blue-50 to-indigo-50 flex items-center justify-center">
                   <ImageIcon className="text-blue-200" size={48} />
                </div>
              )}
              
              <div className="p-6 flex flex-col flex-1">
                <h3 className="text-xl font-bold text-slate-800 mb-2 group-hover:text-blue-600 leading-tight">{story.title}</h3>
                <p className="text-slate-500 line-clamp-3 text-sm mb-4 flex-1">{story.content}</p>
                <div className="flex flex-wrap gap-2 mt-auto">
                  <span className="px-2 py-1 bg-blue-50 text-blue-600 text-xs font-bold rounded">{story.difficulty}</span>
                  {story.tags.map(tag => (
                    <span key={tag} className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded">{tag}</span>
                  ))}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Mini Stats (Quick View) */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <h2 className="text-xl font-bold text-slate-800 mb-6 font-lexend">Weekly Snapshot</h2>
        <div className="h-64 w-full">
           {dailyStats.length > 0 ? (
             <ResponsiveContainer width="100%" height="100%">
               <BarChart data={dailyStats}> 
                 <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                 <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                 <Tooltip 
                    cursor={{fill: '#f1f5f9'}}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                 />
                 <Bar dataKey="wordsRead" fill="#818cf8" radius={[4, 4, 0, 0]} />
               </BarChart>
             </ResponsiveContainer>
           ) : (
             <div className="h-full flex items-center justify-center text-slate-400">
               No reading sessions yet. Start reading!
             </div>
           )}
        </div>
        <button onClick={() => setView(AppView.PROGRESS)} className="w-full mt-4 text-blue-500 font-bold hover:bg-blue-50 py-3 rounded-xl transition">
          View Full Progress Report &rarr;
        </button>
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="max-w-2xl mx-auto space-y-8 p-6 bg-white rounded-3xl shadow-sm">
      <h2 className="text-2xl font-bold text-slate-800 border-b pb-4">Reading Preferences</h2>
      
      {/* Font Section */}
      <div className="space-y-4">
        <label className="text-slate-500 font-bold uppercase text-sm tracking-wider">Font Style</label>
        <div className="grid grid-cols-3 gap-4">
          {[
            { id: FontType.LEXEND, name: 'Modern', style: 'font-lexend' },
            { id: FontType.COMIC, name: 'Friendly', style: 'font-comic' },
            { id: FontType.OPEN_SANS, name: 'Standard', style: 'font-open' },
          ].map((f) => (
             <button
               key={f.id}
               onClick={() => updateSetting('font', f.id)}
               className={`p-4 rounded-xl border-2 text-lg transition ${currentUser?.settings.font === f.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 hover:bg-slate-50'} ${f.style}`}
             >
               {f.name}
             </button>
          ))}
        </div>
      </div>

      {/* Size & Spacing */}
      <div className="space-y-6">
         <div>
            <div className="flex justify-between mb-2">
              <label className="font-bold text-slate-700">Text Size</label>
              <span className="text-slate-400">Aa</span>
            </div>
            <input 
              type="range" min="1" max="5" step="1" 
              value={currentUser?.settings.fontSize}
              onChange={(e) => updateSetting('fontSize', parseInt(e.target.value))}
              className="w-full accent-blue-600 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
            />
         </div>
         <div>
            <div className="flex justify-between mb-2">
              <label className="font-bold text-slate-700">Letter Spacing</label>
              <span className="tracking-widest text-slate-400">A B C</span>
            </div>
            <input 
              type="range" min="0" max="3" step="1" 
              value={currentUser?.settings.letterSpacing}
              onChange={(e) => updateSetting('letterSpacing', parseInt(e.target.value))}
              className="w-full accent-blue-600 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
            />
         </div>
      </div>

      {/* Toggles */}
      <div className="space-y-4">
         <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
            <div className="flex items-center gap-3">
               <Palette className="text-slate-500" />
               <span className="font-bold text-slate-700">High Contrast Mode</span>
            </div>
            <button 
              onClick={() => updateSetting('highContrast', !currentUser?.settings.highContrast)}
              className={`w-14 h-8 rounded-full p-1 transition-colors duration-200 ${currentUser?.settings.highContrast ? 'bg-blue-600' : 'bg-slate-300'}`}
            >
              <div className={`bg-white w-6 h-6 rounded-full shadow-md transform transition-transform duration-200 ${currentUser?.settings.highContrast ? 'translate-x-6' : ''}`} />
            </button>
         </div>

         <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
            <div className="flex items-center gap-3">
               <Type className="text-slate-500" />
               <span className="font-bold text-slate-700">Reading Ruler</span>
            </div>
            <button 
              onClick={() => updateSetting('readingRuler', !currentUser?.settings.readingRuler)}
              className={`w-14 h-8 rounded-full p-1 transition-colors duration-200 ${currentUser?.settings.readingRuler ? 'bg-blue-600' : 'bg-slate-300'}`}
            >
              <div className={`bg-white w-6 h-6 rounded-full shadow-md transform transition-transform duration-200 ${currentUser?.settings.readingRuler ? 'translate-x-6' : ''}`} />
            </button>
         </div>
      </div>
      
      <div className="pt-8 border-t">
         <button onClick={handleLogout} className="flex items-center gap-2 text-red-500 font-bold hover:bg-red-50 px-4 py-2 rounded-lg transition">
           <LogOut size={20} /> Sign Out
         </button>
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen ${currentUser?.settings.highContrast ? 'bg-black' : 'bg-slate-50'} font-sans`}>
      {activeStory && (
        <TextReader 
          title={activeStory.title}
          content={activeStory.content}
          settings={currentUser.settings}
          onSessionComplete={handleSessionComplete}
          onClose={() => setActiveStory(null)}
        />
      )}

      <div className="flex h-screen overflow-hidden">
        {/* Sidebar */}
        <aside className="w-20 lg:w-64 bg-white border-r border-slate-200 flex flex-col items-center lg:items-stretch py-8 z-30 transition-all">
           <div className="px-4 mb-8 flex items-center gap-3 justify-center lg:justify-start">
             <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg">
               RB
             </div>
             <span className="hidden lg:block font-bold text-xl text-slate-800 font-comic">ReadBuddy</span>
           </div>

           <nav className="flex-1 space-y-2 px-2">
             {[
               { id: AppView.DASHBOARD, icon: BookOpen, label: 'Library' },
               { id: AppView.PROGRESS, icon: BarChart2, label: 'Progress' },
               { id: AppView.PRACTICE, icon: Sparkles, label: 'Practice' },
               { id: AppView.GAMES, icon: Gamepad2, label: 'Games' },
               { id: AppView.PROFILE, icon: Settings, label: 'Settings' },
             ].map((item) => (
               <button
                 key={item.id}
                 onClick={() => setView(item.id)}
                 className={`
                   w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200
                   ${view === item.id 
                     ? 'bg-blue-50 text-blue-600 shadow-sm font-bold' 
                     : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}
                 `}
               >
                 <item.icon size={24} />
                 <span className="hidden lg:block">{item.label}</span>
               </button>
             ))}
           </nav>

           <div className="px-4 mt-auto">
              <div className="bg-gradient-to-b from-purple-100 to-white p-4 rounded-2xl text-center hidden lg:block border border-purple-100 shadow-sm">
                <div className="text-purple-600 font-bold mb-1">Daily Streak</div>
                <div className="text-3xl font-black text-slate-800">{currentUser.streak} Days</div>
              </div>
           </div>
        </aside>

        {/* Main Content */}
        <main className={`flex-1 overflow-y-auto p-4 lg:p-8 ${currentUser.settings.highContrast ? 'bg-black' : 'bg-slate-50'}`}>
           <div className="max-w-6xl mx-auto h-full">
              {view === AppView.DASHBOARD && renderDashboard()}
              {view === AppView.PROFILE && renderSettings()}
              {view === AppView.GAMES && <WordMatch />}
              {view === AppView.PRACTICE && <PhonemePractice />}
              {view === AppView.PROGRESS && <ProgressReport user={currentUser} />}
           </div>
        </main>
      </div>
    </div>
  );
};

export default App;