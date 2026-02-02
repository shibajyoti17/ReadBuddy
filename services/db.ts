import { User, ReadingSession, UserSettings, FontType } from '../types';

const DB_NAME = 'ReadBuddyDB';
const DB_VERSION = 1;

export class DatabaseService {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Users Store
        if (!db.objectStoreNames.contains('users')) {
          db.createObjectStore('users', { keyPath: 'username' });
        }

        // Sessions Store
        if (!db.objectStoreNames.contains('sessions')) {
          const sessionStore = db.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
          sessionStore.createIndex('username', 'username', { unique: false });
          sessionStore.createIndex('date', 'date', { unique: false });
        }
      };
    });
  }

  async getUser(username: string): Promise<User | undefined> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['users'], 'readonly');
      const store = transaction.objectStore('users');
      const request = store.get(username);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async createUser(user: User): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['users'], 'readwrite');
      const store = transaction.objectStore('users');
      const request = store.add(user);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async updateUser(user: User): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['users'], 'readwrite');
      const store = transaction.objectStore('users');
      const request = store.put(user);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async addSession(username: string, session: ReadingSession): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['sessions', 'users'], 'readwrite');
      
      // 1. Add Session
      const sessionStore = transaction.objectStore('sessions');
      sessionStore.add({ ...session, username, timestamp: Date.now() });

      // 2. Update User Stats (Aggregate)
      const userStore = transaction.objectStore('users');
      const userRequest = userStore.get(username);

      userRequest.onsuccess = () => {
        const user = userRequest.result as User;
        if (user) {
          user.totalStars += session.stars;
          
          // Streak Logic
          const today = new Date().toDateString();
          const lastRead = user.lastReadDate;
          
          if (lastRead === today) {
            // Already read today, no streak change
          } else if (lastRead === new Date(Date.now() - 86400000).toDateString()) {
            // Read yesterday, increment streak
            user.streak += 1;
          } else {
            // Streak broken
            user.streak = 1;
          }
          user.lastReadDate = today;
          userStore.put(user);
        }
      };

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async getUserSessions(username: string): Promise<ReadingSession[]> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['sessions'], 'readonly');
      const store = transaction.objectStore('sessions');
      const index = store.index('username');
      const request = index.getAll(username);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

export const db = new DatabaseService();