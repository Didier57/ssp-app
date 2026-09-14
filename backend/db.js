const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'ssp.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'lecteur',
    email TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    totp_secret TEXT,
    totp_enabled INTEGER NOT NULL DEFAULT 0,
    last_login_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer TEXT,
    customer_site TEXT,
    date_end_licence TEXT,
    product TEXT,
    mac_address TEXT,
    lic_35 INTEGER,
    siel_id TEXT,
    registered_company TEXT,
    number_user INTEGER,
    contract INTEGER,
    last_lac TEXT,
    date_last_lac TEXT,
    udl_contract TEXT,
    dlu_contract TEXT,
    info_divers TEXT,
    updated_at TEXT,
    updated_by TEXT
  );

  CREATE TABLE IF NOT EXISTS last_ssp (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lac TEXT,
    total_quantity INTEGER,
    available_quantity INTEGER,
    feature TEXT,
    create_date TEXT,
    siel_id TEXT
  );

  CREATE TABLE IF NOT EXISTS par_mois (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    data_json TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS customer_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    mac_address TEXT,
    content BLOB,
    size INTEGER,
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    uploaded_by TEXT,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS reminder_sent (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    date_end_licence TEXT,
    product TEXT,
    sent_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    UNIQUE (customer_id, date_end_licence, product)
  );

CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS licenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lac TEXT,
    feature TEXT,
    feature_name_code TEXT,
    create_date TEXT,
    total_quantity INTEGER NOT NULL DEFAULT 0,
    available_quantity INTEGER NOT NULL DEFAULT 0,
    siel_id TEXT,
    siel_norm TEXT,
    registered_company TEXT,
    license_id TEXT,
    sales_order TEXT,
    delivery_note TEXT,
    purchase_order TEXT,
    license_mode TEXT,
    status_code TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_licenses_lac ON licenses(lac);
  CREATE INDEX IF NOT EXISTS idx_licenses_siel ON licenses(siel_norm);

  CREATE TABLE IF NOT EXISTS free_licenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lac TEXT,
    total_quantity INTEGER NOT NULL DEFAULT 0,
    feature_num TEXT,
    feature TEXT,
    create_date TEXT,
    expire_date TEXT,
    sales_order TEXT,
    delivery_note TEXT,
    purchase_order TEXT,
    license_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE INDEX IF NOT EXISTS idx_free_licenses_lac ON free_licenses(lac);

  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    user_id INTEGER,
    username TEXT,
    category TEXT NOT NULL DEFAULT 'general',
    action TEXT NOT NULL,
    target TEXT,
    detail TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(id DESC);
  CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(username);
  CREATE INDEX IF NOT EXISTS idx_activity_category ON activity_log(category);
`);

// Migration : ajout des colonnes email / active si absentes (BDD existante)
const userCols = db.prepare('PRAGMA table_info(users)').all();
if (!userCols.some((c) => c.name === 'email')) {
  db.exec('ALTER TABLE users ADD COLUMN email TEXT');
}
if (!userCols.some((c) => c.name === 'active')) {
  db.exec('ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
}
if (!userCols.some((c) => c.name === 'totp_secret')) {
  db.exec('ALTER TABLE users ADD COLUMN totp_secret TEXT');
}
if (!userCols.some((c) => c.name === 'totp_enabled')) {
  db.exec('ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0');
}
if (!userCols.some((c) => c.name === 'last_login_at')) {
  db.exec('ALTER TABLE users ADD COLUMN last_login_at TEXT');
}

module.exports = db;

