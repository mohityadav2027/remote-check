// SQLite database (uses Node's built-in node:sqlite, no native build needed)
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const fs = require('fs');

// Everything persistent (database + resumes) lives in one folder, so a single disk/volume keeps it all.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.db');
const DATA_DIR = path.dirname(DB_PATH);
const RESUME_DIR = path.join(DATA_DIR, 'resumes');
fs.mkdirSync(RESUME_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  headline TEXT,
  skills TEXT,                 -- comma separated, used for job matching
  experience_years INTEGER DEFAULT 0,
  resume_path TEXT,
  resume_name TEXT,
  is_admin INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  website TEXT,
  linkedin_url TEXT,
  founded_year INTEGER,
  employee_count INTEGER,
  hq_country TEXT,
  description TEXT,
  domain_created TEXT,         -- from RDAP (WHOIS) lookup
  domain_checked_at TEXT,
  verified_by_admin INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  segment TEXT NOT NULL,       -- basic | pro | premium (decides price)
  category TEXT,
  description TEXT,
  salary_min INTEGER,
  salary_max INTEGER,
  salary_currency TEXT DEFAULT 'USD',
  location TEXT,
  india_eligible INTEGER DEFAULT 1,
  apply_url TEXT NOT NULL,     -- original job page (LinkedIn, company careers, etc.)
  source TEXT DEFAULT 'manual',
  external_id TEXT UNIQUE,
  tags TEXT,
  posted_at TEXT DEFAULT (datetime('now')),
  status TEXT DEFAULT 'open',  -- open | closed
  closed_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  segment TEXT NOT NULL,
  amount_usd REAL NOT NULL,
  amount_inr INTEGER NOT NULL,
  fx_rate REAL NOT NULL,
  provider TEXT NOT NULL,      -- razorpay | demo
  provider_order_id TEXT,
  provider_payment_id TEXT,
  status TEXT DEFAULT 'created', -- created | paid
  starts_at TEXT,
  expires_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, job_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,          -- hired | interview | no_response | scam
  note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS source_status (
  source TEXT PRIMARY KEY,     -- e.g. remotive, greenhouse:gitlab
  label TEXT,
  last_run TEXT,
  fetched INTEGER DEFAULT 0,
  added INTEGER DEFAULT 0,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, posted_at);
`);

// Columns added after the first release (safe to run on an existing database)
const companyCols = db.prepare('PRAGMA table_info(companies)').all().map(c => c.name);
if (!companyCols.includes('ats_type')) db.exec('ALTER TABLE companies ADD COLUMN ats_type TEXT');   // greenhouse | lever | ashby
if (!companyCols.includes('ats_board')) db.exec('ALTER TABLE companies ADD COLUMN ats_board TEXT'); // board name in the careers URL

db.RESUME_DIR = RESUME_DIR;
module.exports = db;
