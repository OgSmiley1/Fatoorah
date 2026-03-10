import Database from 'better-sqlite3';
import path from 'path';

const db = new Database('wizard.db');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS merchants (
    id TEXT PRIMARY KEY,
    business_name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    source_platform TEXT,
    source_url TEXT,
    category TEXT,
    subcategory TEXT,
    country TEXT,
    city TEXT,
    website TEXT,
    phone TEXT,
    whatsapp TEXT,
    email TEXT,
    instagram_handle TEXT,
    github_url TEXT,
    tiktok_handle TEXT,
    telegram_handle TEXT,
    first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_validated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confidence_score REAL DEFAULT 0,
    contactability_score REAL DEFAULT 0,
    myfatoorah_fit_score REAL DEFAULT 0,
    evidence_json TEXT,
    metadata_json TEXT
  );

  CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    merchant_id TEXT NOT NULL,
    status TEXT DEFAULT 'NEW',
    run_id TEXT,
    notes TEXT,
    next_action TEXT,
    follow_up_date TEXT,
    first_contact_at TEXT,
    last_contact_at TEXT,
    outcome TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (merchant_id) REFERENCES merchants(id)
  );

  CREATE TABLE IF NOT EXISTS search_runs (
    id TEXT PRIMARY KEY,
    query TEXT NOT NULL,
    source TEXT,
    results_count INTEGER DEFAULT 0,
    new_leads_count INTEGER DEFAULT 0,
    status TEXT,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level TEXT DEFAULT 'INFO',
    event TEXT NOT NULL,
    details TEXT,
    run_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_merchants_normalized_name ON merchants(normalized_name);
  CREATE INDEX IF NOT EXISTS idx_merchants_phone ON merchants(phone);
  CREATE INDEX IF NOT EXISTS idx_merchants_email ON merchants(email);
  CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
  CREATE INDEX IF NOT EXISTS idx_leads_merchant_id ON leads(merchant_id);
`);

export default db;
