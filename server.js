/**
 * ReadBuddy Backend Server
 * 
 * To run this locally:
 * 1. Initialize a package.json: npm init -y
 * 2. Install dependencies: npm install express cors body-parser sqlite3 jsonwebtoken bcryptjs
 * 3. Run: node server.js
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
// Cloud Run injects the PORT environment variable. We must listen on it.
const PORT = process.env.PORT || 3001;
const SECRET_KEY = "readbuddy-secret-key-change-me";

app.use(cors());
app.use(bodyParser.json());

// --- Database Setup ---
const db = new sqlite3.Database('./readbuddy.sqlite', (err) => {
  if (err) console.error("DB Error", err);
  else console.log("Connected to SQLite database.");
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    password TEXT,
    avatar TEXT,
    totalStars INTEGER DEFAULT 0,
    streak INTEGER DEFAULT 0,
    lastReadDate TEXT,
    settings TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    date TEXT,
    timestamp INTEGER,
    wordsRead INTEGER,
    accuracy INTEGER,
    stars INTEGER,
    storyId TEXT,
    missedWords TEXT,
    FOREIGN KEY(username) REFERENCES users(username)
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS custom_stories (
    id TEXT PRIMARY KEY,
    username TEXT,
    title TEXT,
    content TEXT,
    difficulty TEXT,
    tags TEXT,
    imageUrl TEXT,
    FOREIGN KEY(username) REFERENCES users(username)
  )`);
});

// --- Middleware ---
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "No token" });
  
  const token = authHeader.split(' ')[1];
  jwt.verify(token, SECRET_KEY, (err, decoded) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    req.user = decoded;
    next();
  });
};

// --- Routes ---

// Health Check for Cloud Deployments (Required for many load balancers)
app.get('/', (req, res) => {
  res.send('ReadBuddy API is running.');
});

// Register
app.post('/api/register', (req, res) => {
  const { username, password, avatar } = req.body;
  const hashedPassword = bcrypt.hashSync(password, 8);
  const defaultSettings = JSON.stringify({
    font: 'font-lexend', fontSize: 2, letterSpacing: 1, lineHeight: 2, highContrast: false, readingRuler: false
  });

  db.run(`INSERT INTO users (username, password, avatar, settings) VALUES (?, ?, ?, ?)`, 
    [username, hashedPassword, avatar, defaultSettings], 
    function(err) {
      if (err) return res.status(400).json({ error: "Username taken" });
      
      const token = jwt.sign({ username }, SECRET_KEY, { expiresIn: '24h' });
      // Return user object similar to frontend type
      res.json({ 
        user: { username, avatar, totalStars: 0, streak: 0, settings: JSON.parse(defaultSettings), customStories: [] },
        token 
      });
    }
  );
});

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
    if (err || !user) return res.status(404).json({ error: "User not found" });
    
    const valid = bcrypt.compareSync(password, user.password);
    if (!valid) return res.status(401).json({ error: "Invalid password" });

    const token = jwt.sign({ username }, SECRET_KEY, { expiresIn: '24h' });
    
    // Fetch user stories
    db.all(`SELECT * FROM custom_stories WHERE username = ?`, [username], (err, stories) => {
        const parsedStories = stories ? stories.map(s => ({...s, tags: JSON.parse(s.tags)})) : [];
        res.json({
            user: {
                ...user,
                settings: JSON.parse(user.settings),
                customStories: parsedStories
            },
            token
        });
    });
  });
});

// Get Current User (Session Resume)
app.get('/api/me', authenticate, (req, res) => {
    db.get(`SELECT * FROM users WHERE username = ?`, [req.user.username], (err, user) => {
        if (!user) return res.status(404).json({ error: "User not found" });
        db.all(`SELECT * FROM custom_stories WHERE username = ?`, [req.user.username], (err, stories) => {
            const parsedStories = stories ? stories.map(s => ({...s, tags: JSON.parse(s.tags)})) : [];
            res.json({
                ...user,
                settings: JSON.parse(user.settings),
                customStories: parsedStories
            });
        });
    });
});

// Update Settings
app.put('/api/users/settings', authenticate, (req, res) => {
    const { settings } = req.body;
    db.run(`UPDATE users SET settings = ? WHERE username = ?`, [JSON.stringify(settings), req.user.username], (err) => {
        if (err) return res.status(500).json({error: "Failed"});
        res.json({ success: true });
    });
});

// Add Session
app.post('/api/sessions', authenticate, (req, res) => {
    const s = req.body;
    db.run(`INSERT INTO sessions (username, date, timestamp, wordsRead, accuracy, stars, storyId, missedWords) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.username, s.date, Date.now(), s.wordsRead, s.accuracy, s.stars, s.storyId, JSON.stringify(s.missedWords || [])],
      function(err) {
          if (err) return res.status(500).json({error: err.message});
          
          // Update aggregates
          db.get(`SELECT * FROM users WHERE username = ?`, [req.user.username], (err, user) => {
              let newStars = user.totalStars + s.stars;
              let newStreak = user.streak;
              // Simple streak logic (same as frontend)
              const today = new Date().toDateString();
              if (user.lastReadDate !== today) {
                  const yesterday = new Date(Date.now() - 86400000).toDateString();
                  if (user.lastReadDate === yesterday) newStreak++;
                  else newStreak = 1;
              }
              
              db.run(`UPDATE users SET totalStars = ?, streak = ?, lastReadDate = ? WHERE username = ?`, 
                [newStars, newStreak, today, req.user.username],
                () => res.json({ success: true })
              );
          });
      }
    );
});

// Get Sessions
app.get('/api/sessions', authenticate, (req, res) => {
    db.all(`SELECT * FROM sessions WHERE username = ? ORDER BY timestamp ASC`, [req.user.username], (err, rows) => {
        if (err) return res.status(500).json({error: "Failed"});
        const parsed = rows.map(r => ({
            ...r,
            missedWords: JSON.parse(r.missedWords || '[]')
        }));
        res.json(parsed);
    });
});

// Add Story
app.post('/api/stories', authenticate, (req, res) => {
    const s = req.body;
    db.run(`INSERT INTO custom_stories (id, username, title, content, difficulty, tags, imageUrl) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [s.id, req.user.username, s.title, s.content, s.difficulty, JSON.stringify(s.tags), s.imageUrl],
      (err) => {
          if (err) return res.status(500).json({error: err.message});
          res.json({success: true});
      }
    );
});

app.listen(PORT, () => {
  console.log(`ReadBuddy Server running on port ${PORT}`);
});