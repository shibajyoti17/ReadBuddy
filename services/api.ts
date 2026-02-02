import { User, UserSettings, ReadingSession, Story, FontType } from '../types';
import { db } from './db';
import { AuthService } from './auth';

// TOGGLE THIS TO TRUE TO USE THE LOCAL NODE.JS BACKEND
const USE_BACKEND = false; 
const API_URL = 'http://localhost:3001/api';
const TOKEN_KEY = 'readbuddy_access_token';

const DEFAULT_SETTINGS: UserSettings = {
  font: FontType.LEXEND,
  fontSize: 2,
  letterSpacing: 1,
  lineHeight: 2,
  highContrast: false,
  readingRuler: false,
  rulerColor: '#fef08a'
};

// --- Helper Functions for Mock Auth ---

async function hashPassword(password: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateToken(username: string): string {
  const payload = {
    sub: username,
    iat: Date.now(),
    exp: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
  };
  return btoa(JSON.stringify(payload));
}

function verifyToken(token: string): string | null {
  try {
    const json = atob(token);
    const payload = JSON.parse(json);
    if (Date.now() > payload.exp) return null;
    return payload.sub;
  } catch (e) {
    return null;
  }
}

/**
 * Common interface for both Mock and Real API.
 */
interface ApiClient {
  login(username: string, password: string): Promise<User>;
  register(username: string, password: string, avatar: string): Promise<User>;
  getCurrentUser(): Promise<User | null>;
  updateSettings(username: string, settings: UserSettings): Promise<void>;
  addSession(username: string, session: ReadingSession): Promise<void>;
  getSessions(username: string): Promise<ReadingSession[]>;
  addStory(username: string, story: Story): Promise<void>;
}

// --- Real Backend Implementation ---
const HttpApiClient: ApiClient = {
    async login(username, password) {
        const res = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Login failed');
        localStorage.setItem(TOKEN_KEY, data.token); // Store real JWT
        return data.user;
    },

    async register(username, password, avatar) {
        const res = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, avatar })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Register failed');
        localStorage.setItem(TOKEN_KEY, data.token);
        return data.user;
    },

    async getCurrentUser() {
        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) return null;
        try {
            const res = await fetch(`${API_URL}/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) {
                localStorage.removeItem(TOKEN_KEY);
                return null;
            }
            return await res.json();
        } catch (e) {
            return null;
        }
    },

    async updateSettings(username, settings) {
        const token = localStorage.getItem(TOKEN_KEY);
        await fetch(`${API_URL}/users/settings`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({ settings })
        });
    },

    async addSession(username, session) {
        const token = localStorage.getItem(TOKEN_KEY);
        await fetch(`${API_URL}/sessions`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify(session)
        });
    },

    async getSessions(username) {
        const token = localStorage.getItem(TOKEN_KEY);
        const res = await fetch(`${API_URL}/sessions`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return [];
        return await res.json();
    },

    async addStory(username, story) {
        const token = localStorage.getItem(TOKEN_KEY);
        await fetch(`${API_URL}/stories`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify(story)
        });
    }
};

// --- Mock Implementation (IndexedDB wrapper) ---
const MockApiClient: ApiClient = {
    async login(username, password) {
        const user = await db.getUser(username);
        if (!user) {
          throw new Error("User not found.");
        }
        
        const hashedInput = await hashPassword(password);
        if (user.password !== hashedInput) {
          throw new Error("Incorrect password.");
        }

        const token = generateToken(user.username);
        localStorage.setItem(TOKEN_KEY, token);
        
        return user;
    },

    async register(username, password, avatar) {
        const existing = await db.getUser(username);
        if (existing) {
          throw new Error("Username already taken.");
        }

        const hashedPassword = await hashPassword(password);

        const newUser: User = {
          username,
          password: hashedPassword,
          avatar,
          totalStars: 0,
          streak: 0,
          sessions: [],
          customStories: [],
          settings: DEFAULT_SETTINGS,
          lastReadDate: ''
        };

        await db.createUser(newUser);
        
        const token = generateToken(username);
        localStorage.setItem(TOKEN_KEY, token);
        
        return newUser;
    },

    async getCurrentUser() {
        const token = localStorage.getItem(TOKEN_KEY);
        if (!token) return null;
        
        const username = verifyToken(token);
        if (!username) {
          localStorage.removeItem(TOKEN_KEY);
          return null;
        }
        
        const user = await db.getUser(username);
        if (!user) {
            localStorage.removeItem(TOKEN_KEY);
            return null;
        }
        return user;
    },

    async updateSettings(username, settings) {
        const user = await db.getUser(username);
        if (user) {
            user.settings = settings;
            await db.updateUser(user);
        }
    },

    async addSession(username, session) {
        await db.addSession(username, session);
    },

    async getSessions(username) {
        return db.getUserSessions(username);
    },

    async addStory(username, story) {
        const user = await db.getUser(username);
        if (user) {
            user.customStories = [story, ...(user.customStories || [])];
            await db.updateUser(user);
        }
    }
};

export const api = USE_BACKEND ? HttpApiClient : MockApiClient;