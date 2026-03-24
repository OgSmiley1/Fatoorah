import Database from 'better-sqlite3';
const db = new Database('wizard.db');
const info = db.prepare("PRAGMA table_info(merchants)").all();
console.log(JSON.stringify(info, null, 2));
