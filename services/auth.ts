import { User, UserSettings } from '../types';
import { api } from './api';

// --- Auth Service (Facade) ---

export const AuthService = {
  login: async (username: string, password: string): Promise<User> => {
    // Delegate to API layer
    return api.login(username, password);
  },

  register: async (username: string, password: string, avatar: string): Promise<User> => {
    // Delegate to API layer
    return api.register(username, password, avatar);
  },

  logout: () => {
    localStorage.removeItem('readbuddy_access_token');
  },

  /**
   * Validates the session token from local storage and fetches the user.
   */
  getCurrentSession: async (): Promise<User | null> => {
    return api.getCurrentUser();
  },

  updateSettings: async (username: string, settings: UserSettings): Promise<User | null> => {
    await api.updateSettings(username, settings);
    const user = await api.getCurrentUser();
    return user;
  },
  
  refreshUser: async (username: string): Promise<User | undefined | null> => {
    return api.getCurrentUser();
  }
};