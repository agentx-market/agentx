const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Database path
const dbPath = path.join(__dirname, 'agentx.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');

// Prepared statement cache (better-sqlite3 handles this automatically)
db.pragma('cache_size = 10000'); // ~40MB cache

// ============ Migration Runner ============
function runMigrations() {
  const migrationsDir = path.join(__dirname, 'migrations');
  
  if (!fs.existsSync(migrationsDir)) {
    console.log('[db] No migrations folder found, skipping migrations');
    return;
  }

  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort(); // Files sorted alphabetically (001_, 002_, etc.)

  // Track executed migrations
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT UNIQUE NOT NULL,
      executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  for (const file of migrationFiles) {
    const sqlPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Check if already executed
    const executed = db.prepare('SELECT 1 FROM _migrations WHERE filename = ?').get(file);
    
    if (!executed) {
      console.log(`[db] Running migration: ${file}`);
      try {
        db.exec(sql);
        db.prepare('INSERT INTO _migrations (filename) VALUES (?)').run(file);
        console.log(`[db] Migration completed: ${file}`);
      } catch (err) {
        console.error(`[db] Migration failed: ${file}`, err.message);
        throw err;
      }
    }
  }
}

// Run migrations on startup
runMigrations();

// ============ Query Helpers ============
module.exports = {
  // Low-level database access (singleton connection)
  db,
  
  // Execute SQL and return void (for CREATE, INSERT, UPDATE, DELETE)
  // Returns the statement with changes/lastInsertRowid
  run(sql, params = []) {
    const stmt = db.prepare(sql);
    return stmt.run(...params);
  },
  
  // Execute SQL and return first row (or null)
  get(sql, params = []) {
    const stmt = db.prepare(sql);
    return stmt.get(...params);
  },
  
  // Execute SQL and return all rows (as array)
  all(sql, params = []) {
    const stmt = db.prepare(sql);
    return stmt.all(...params);
  },
  
  // Execute raw SQL (use with caution, multiple statements)
  exec(sql) {
    return db.exec(sql);
  },
  
  // Transaction helper - wraps function in a transaction
  transaction(fn) {
    const txn = db.transaction(fn);
    return txn;
  },
  
  // Prepared statement helper for reuse
  prepare(sql) {
    return db.prepare(sql);
  }
};
