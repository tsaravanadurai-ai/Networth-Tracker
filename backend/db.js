const { createClient } = require('@libsql/client');
const crypto = require('crypto');

let db;

function getDb() {
  if (!db) {
    db = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return db;
}

// Password hashing with Node's built-in crypto
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const verify = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return hash === verify;
}

async function initializeDatabase() {
  const db = getDb();

  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS family_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      label TEXT NOT NULL,
      color TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS monthly_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_member_id INTEGER NOT NULL,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      invested_amount REAL DEFAULT 0,
      current_value REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (family_member_id) REFERENCES family_members(id)
    );

    CREATE TABLE IF NOT EXISTS gold_savings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_member_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      grams REAL NOT NULL,
      purchase_month INTEGER NOT NULL,
      purchase_year INTEGER NOT NULL,
      purchase_price_per_gram REAL DEFAULT 0,
      purchase_amount REAL DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (family_member_id) REFERENCES family_members(id)
    );

    CREATE TABLE IF NOT EXISTS bank_reserves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_member_id INTEGER NOT NULL,
      bank_name TEXT NOT NULL,
      account_type TEXT DEFAULT 'Savings',
      amount REAL NOT NULL,
      notes TEXT DEFAULT '',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (family_member_id) REFERENCES family_members(id)
    );

    CREATE TABLE IF NOT EXISTS debt_given (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_member_id INTEGER NOT NULL,
      person_name TEXT NOT NULL,
      amount REAL NOT NULL,
      given_date TEXT NOT NULL,
      expected_return_date TEXT DEFAULT '',
      purpose TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (family_member_id) REFERENCES family_members(id)
    );

    CREATE TABLE IF NOT EXISTS gold_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      price_per_gram REAL NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(month, year)
    );

    CREATE TABLE IF NOT EXISTS share_holdings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_member_id INTEGER NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      instrument TEXT NOT NULL,
      quantity REAL DEFAULT 0,
      avg_cost REAL DEFAULT 0,
      ltp REAL DEFAULT 0,
      invested REAL DEFAULT 0,
      current_value REAL DEFAULT 0,
      pnl REAL DEFAULT 0,
      pnl_percent REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (family_member_id) REFERENCES family_members(id)
    );

    CREATE TABLE IF NOT EXISTS dividends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_member_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      stock_name TEXT NOT NULL,
      amount REAL DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (family_member_id) REFERENCES family_members(id)
    );
  `);

  const memberCount = await db.execute('SELECT COUNT(*) as count FROM family_members');
  if (memberCount.rows[0].count === 0) {
    await db.execute({ sql: 'INSERT INTO family_members (name, label, color) VALUES (?, ?, ?)', args: ['Saravana', 'Myself', '#4F46E5'] });
    await db.execute({ sql: 'INSERT INTO family_members (name, label, color) VALUES (?, ?, ?)', args: ['Iswarya', 'Wife', '#EC4899'] });
    await db.execute({ sql: 'INSERT INTO family_members (name, label, color) VALUES (?, ?, ?)', args: ['Sarvesh', 'Son', '#10B981'] });
    await db.execute({ sql: 'INSERT INTO family_members (name, label, color) VALUES (?, ?, ?)', args: ['Ishana', 'Daughter', '#F59E0B'] });
    await db.execute({ sql: 'INSERT INTO family_members (name, label, color) VALUES (?, ?, ?)', args: ['HUF', 'Family Account', '#8B5CF6'] });
  }

  const userCount = await db.execute('SELECT COUNT(*) as count FROM users');
  if (userCount.rows[0].count === 0) {
    const hashedPassword = hashPassword('Saravana@2024');
    await db.execute({ sql: 'INSERT INTO users (username, password) VALUES (?, ?)', args: ['saravana', hashedPassword] });
  }

  console.log('Database initialized (Turso)');
}

module.exports = { getDb, initializeDatabase, hashPassword, verifyPassword };
