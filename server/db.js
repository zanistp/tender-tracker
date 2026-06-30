const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '..', 'data', 'tenders.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS tenders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tender_no TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  department TEXT,
  description TEXT,
  est_value REAL,
  status TEXT NOT NULL DEFAULT 'Request',
  request_date TEXT,
  publish_date TEXT,
  close_date TEXT,
  award_date TEXT,
  contract_signed_date TEXT,
  winning_bidder TEXT,
  contract_value REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bidders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tender_id INTEGER NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  bid_amount REAL,
  submitted_date TEXT,
  status TEXT NOT NULL DEFAULT 'Submitted',
  remarks TEXT
);

CREATE TABLE IF NOT EXISTS status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tender_id INTEGER NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  changed_at TEXT NOT NULL DEFAULT (datetime('now')),
  note TEXT
);
`);

module.exports = db;
