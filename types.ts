export enum AppView {
  DASHBOARD = 'DASHBOARD',
  READER = 'READER',
  PRACTICE = 'PRACTICE',
  GAMES = 'GAMES',
  PROFILE = 'PROFILE',
  PROGRESS = 'PROGRESS'
}

export enum FontType {
  LEXEND = 'font-lexend',
  COMIC = 'font-comic',
  OPEN_SANS = 'font-open',
}

export interface UserSettings {
  font: FontType;
  fontSize: number; // 1-5 scale
  letterSpacing: number; // 0-3 scale
  lineHeight: number; // 1-3 scale
  highContrast: boolean;
  readingRuler: boolean;
  rulerColor: string;
}

export interface Story {
  id: string;
  title: string;
  content: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  tags: string[];
  imageUrl?: string; // New field for story illustration
}

export interface WordPractice {
  word: string;
  syllables: string[];
  phonetics: string;
  definition: string;
  mastered: boolean;
}

export interface ReadingSession {
  id?: number;
  date: string;
  timestamp?: number;
  wordsRead: number;
  accuracy: number;
  stars: number;
  storyId?: string;
  username?: string;
  missedWords?: string[]; // Added for adaptive history
}

export interface User {
  username: string;
  password?: string; // Added for Auth
  avatar: string; // emoji
  totalStars: number;
  streak: number;
  lastReadDate?: string; // For calculating streak
  sessions: ReadingSession[]; // Keeping for backward compat in UI, but DB uses separate store
  customStories: Story[];
  settings: UserSettings;
}