import React, { useState } from 'react';
import { User as UserIcon, ArrowRight, Lock, LogIn, UserPlus } from 'lucide-react';
import { AuthService } from '../../services/auth';
import { User } from '../../types';

interface LoginProps {
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('🦊');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const avatars = ['🦊', '🐯', '🦁', '🐶', '🦄', '🐸', '🐼', '🐨'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!username.trim() || !password.trim()) {
        throw new Error("Please fill in all fields");
      }

      let user: User;
      if (isRegister) {
        user = await AuthService.register(username, password, selectedAvatar);
      } else {
        user = await AuthService.login(username, password);
      }
      onLogin(user);
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center p-4 font-sans">
      <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-md w-full animate-bounce-in">
        <div className="text-center mb-6">
          <div className="bg-blue-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner">
            <span className="text-4xl">📚</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-800 font-comic">ReadBuddy</h1>
          <p className="text-slate-500">{isRegister ? "Join the Adventure!" : "Welcome Back!"}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-slate-700 font-bold mb-1 ml-1 text-sm">Username</label>
            <div className="relative">
              <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your name"
                className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none font-bold text-slate-700"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-700 font-bold mb-1 ml-1 text-sm">Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Secret code"
                className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none font-bold text-slate-700"
                required
              />
            </div>
          </div>

          {isRegister && (
            <div>
              <label className="block text-slate-700 font-bold mb-2 ml-1 text-sm">Pick your buddy!</label>
              <div className="grid grid-cols-4 gap-2">
                {avatars.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setSelectedAvatar(a)}
                    className={`text-2xl p-2 rounded-xl transition transform hover:scale-110 ${selectedAvatar === a ? 'bg-blue-100 border-2 border-blue-400 shadow-md' : 'bg-slate-50 border border-slate-100'}`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <div className="text-red-500 text-sm font-bold text-center bg-red-50 p-2 rounded-lg">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-bold text-xl shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <span className="animate-pulse">Loading...</span>
            ) : isRegister ? (
              <>Start Adventure <ArrowRight size={24} /></>
            ) : (
              <>Let's Read <LogIn size={24} /></>
            )}
          </button>
        </form>
        
        <div className="mt-6 text-center">
          <button 
            type="button"
            onClick={() => setIsRegister(!isRegister)}
            className="text-blue-500 hover:text-blue-700 font-bold text-sm flex items-center justify-center gap-1 mx-auto"
          >
            {isRegister ? <><LogIn size={16}/> Already have an account? Login</> : <><UserPlus size={16}/> New here? Create Account</>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;