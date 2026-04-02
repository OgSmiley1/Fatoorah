import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'wizard.db');

function createDatabase() {
  try {
    const database = new Database(dbPath);
    database.pragma('journal_mode = WAL');
    database.pragma('synchronous = NORMAL');
    return database;
  } catch (error) {
    if (error instanceof Error && (error.message.includes('malformed') || (error as any).code === 'SQLITE_CORRUPT')) {
      console.error('Database is malformed. Deleting and recreating...', error);
      try {
        // Delete the corrupted database file and its associated WAL/SHM files
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
        if (fs.existsSync(`${dbPath}-wal`)) fs.unlinkSync(`${dbPath}-wal`);
        if (fs.existsSync(`${dbPath}-shm`)) fs.unlinkSync(`${dbPath}-shm`);
        
        const database = new Database(dbPath);
        database.pragma('journal_mode = WAL');
        database.pragma('synchronous = NORMAL');
        return database;
      } catch (retryError) {
        console.error('Failed to recreate database:', retryError);
        throw retryError;
      }
    }
    throw error;
  }
}

const db = createDatabase();

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
    facebook_url TEXT,
    twitter_handle TEXT,
    linkedin_url TEXT,
    physical_address TEXT,
    dul_number TEXT,
    first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_validated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confidence_score REAL DEFAULT 0,
    contactability_score REAL DEFAULT 0,
    myfatoorah_fit_score REAL DEFAULT 0,
    quality_score REAL DEFAULT 0,
    reliability_score REAL DEFAULT 0,
    compliance_score REAL DEFAULT 0,
    risk_assessment_json TEXT,
    estimated_revenue REAL DEFAULT 0,
    setup_fee REAL DEFAULT 0,
    payment_gateway TEXT,
    scripts_json TEXT,
    evidence_json TEXT,
    contact_validation_json TEXT,
    metadata_json TEXT,
    followers INTEGER
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

// Migration: Add missing columns if they don't exist
const tableInfo = db.prepare("PRAGMA table_info(merchants)").all() as any[];
const columnNames = tableInfo.map(c => c.name);

const migrations = [
  { name: 'subcategory', type: 'TEXT' },
  { name: 'country', type: 'TEXT' },
  { name: 'city', type: 'TEXT' },
  { name: 'website', type: 'TEXT' },
  { name: 'whatsapp', type: 'TEXT' },
  { name: 'instagram_handle', type: 'TEXT' },
  { name: 'github_url', type: 'TEXT' },
  { name: 'facebook_url', type: 'TEXT' },
  { name: 'twitter_handle', type: 'TEXT' },
  { name: 'linkedin_url', type: 'TEXT' },
  { name: 'tiktok_handle', type: 'TEXT' },
  { name: 'telegram_handle', type: 'TEXT' },
  { name: 'physical_address', type: 'TEXT' },
  { name: 'dul_number', type: 'TEXT' },
  { name: 'quality_score', type: 'REAL DEFAULT 0' },
  { name: 'reliability_score', type: 'REAL DEFAULT 0' },
  { name: 'compliance_score', type: 'REAL DEFAULT 0' },
  { name: 'risk_assessment_json', type: 'TEXT' },
  { name: 'estimated_revenue', type: 'REAL DEFAULT 0' },
  { name: 'setup_fee', type: 'REAL DEFAULT 0' },
  { name: 'payment_gateway', type: 'TEXT' },
  { name: 'scripts_json', type: 'TEXT' },
  { name: 'pricing_json', type: 'TEXT' },
  { name: 'revenue_json', type: 'TEXT' },
  { name: 'evidence_json', type: 'TEXT' },
  { name: 'contact_validation_json', type: 'TEXT' },
  { name: 'metadata_json', type: 'TEXT' },
  { name: 'latitude', type: 'REAL' },
  { name: 'longitude', type: 'REAL' },
  { name: 'source_count', type: 'INTEGER DEFAULT 1' },
  { name: 'source_list', type: 'TEXT' },
  { name: 'followers', type: 'INTEGER' }
];

for (const col of migrations) {
  if (!columnNames.includes(col.name)) {
    try {
      db.exec(`ALTER TABLE merchants ADD COLUMN ${col.name} ${col.type}`);
      console.log(`Migration: Added column ${col.name} to merchants table`);
    } catch (e) {
      console.error(`Migration failed for ${col.name}:`, e);
    }
  }
}

export default db;
