const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'pickleball.db'));

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS courts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    court_id INTEGER NOT NULL,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT,
    date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'confirmed',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (court_id) REFERENCES courts(id)
  );

  CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date);
  CREATE INDEX IF NOT EXISTS idx_bookings_court_date ON bookings(court_id, date);
`);

// Seed default courts if none exist
const courtCount = db.prepare('SELECT COUNT(*) as count FROM courts').get();
if (courtCount.count === 0) {
  const insertCourt = db.prepare('INSERT INTO courts (name, description) VALUES (?, ?)');
  insertCourt.run('Court 1', 'Main outdoor court');
  insertCourt.run('Court 2', 'Secondary outdoor court');
  insertCourt.run('Court 3', 'Indoor court');
  insertCourt.run('Court 4', 'Indoor court with lighting');
}

module.exports = db;
