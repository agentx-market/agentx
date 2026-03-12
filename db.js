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

// ===== Abuse prevention tables =====
db.exec(`
  CREATE TABLE IF NOT EXISTS operator_limits (
    id INTEGER PRIMARY KEY,
    operator_id TEXT UNIQUE NOT NULL,
    github_username TEXT,
    github_account_created_at INTEGER,  -- GitHub account creation timestamp
    agent_count INTEGER DEFAULT 0,
    last_registration_timestamp INTEGER,
    ip_address TEXT,
    created_at INTEGER,
    updated_at INTEGER
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS ip_registrations (
    id INTEGER PRIMARY KEY,
    ip_address TEXT NOT NULL,
    operator_id TEXT NOT NULL,
    timestamp INTEGER,
    UNIQUE(ip_address, operator_id)
  )
`);

// Create newsletter_subscribers table for email signup form
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS newsletter_subscribers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      subscribed_at INTEGER NOT NULL,
      unsubscribed_at INTEGER DEFAULT NULL,
      UNIQUE(email, unsubscribed_at)
    )
  `);
  console.log('[db] Newsletter subscribers table created');
} catch (err) {
  console.log('[db] Newsletter subscribers table may already exist:', err.message);
}

const newsletterSubscriberColumns = [
  { name: 'topics', definition: "TEXT DEFAULT '[]'" },
  { name: 'source_path', definition: 'TEXT' },
  { name: 'sync_status', definition: "TEXT DEFAULT 'pending'" },
  { name: 'sync_provider', definition: 'TEXT' },
  { name: 'welcome_email_sent_at', definition: 'INTEGER' },
  { name: 'last_synced_at', definition: 'INTEGER' },
];

newsletterSubscriberColumns.forEach(({ name, definition }) => {
  try {
    db.exec(`ALTER TABLE newsletter_subscribers ADD COLUMN ${name} ${definition}`);
    console.log(`[db] Added newsletter_subscribers.${name}`);
  } catch (err) {
    if (!String(err.message || '').includes('duplicate column name')) {
      console.log(`[db] newsletter_subscribers.${name} migration skipped:`, err.message);
    }
  }
});

// Create newsletter sponsorship bookings for weekly issue placements
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS newsletter_sponsor_bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operator_id TEXT NOT NULL,
      week_start TEXT NOT NULL,
      slot_position INTEGER NOT NULL,
      sponsor_name TEXT NOT NULL,
      sponsor_url TEXT NOT NULL,
      logo_url TEXT NOT NULL,
      blurb TEXT NOT NULL,
      price_usd_cents INTEGER NOT NULL DEFAULT 5000,
      invoice_id INTEGER,
      status TEXT NOT NULL DEFAULT 'booked',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (operator_id) REFERENCES operators(id) ON DELETE CASCADE,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL,
      UNIQUE(week_start, slot_position)
    )
  `);
  console.log('[db] Newsletter sponsor bookings table created');
} catch (err) {
  console.log('[db] Newsletter sponsor bookings table may already exist:', err.message);
}

// Create operators table if it doesn't exist
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS operators (
      id TEXT PRIMARY KEY,
      github_id TEXT,
      google_id TEXT,
      email TEXT,
      name TEXT,
      github_username TEXT,
      github_account_created_at INTEGER,
      welcome_bonus_claimed_at INTEGER,
      created_at INTEGER,
      verified INTEGER DEFAULT 0,
      verification_method TEXT,
      verified_at INTEGER,
      welcome_email_sent INTEGER DEFAULT 0
    )
  `);
  console.log('[db] Operators table created');
} catch (err) {
  console.log('[db] Operators table may already exist:', err.message);
}

function ensureTableColumns(tableName, columns) {
  const existingColumns = new Set(
    db.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name)
  );

  for (const [columnName, definition] of columns) {
    if (existingColumns.has(columnName)) continue;

    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    console.log(`[db] Added ${tableName}.${columnName}`);
  }
}

try {
  ensureTableColumns('operators', [
    ['github_account_created_at', 'INTEGER'],
    ['welcome_bonus_claimed_at', 'INTEGER'],
    ['updated_at', 'INTEGER'],
    ['verified', 'INTEGER DEFAULT 0'],
    ['verification_method', 'TEXT'],
    ['verified_at', 'INTEGER'],
    ['welcome_email_sent', 'INTEGER DEFAULT 0'],
    ['wallet_id', 'TEXT'],
    ['wallet_funded_at', 'INTEGER'],
  ]);
} catch (err) {
  console.log('[db] Operators columns may already exist:', err.message);
}

// Create agents table with health check fields (if it doesn't exist)
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id INTEGER PRIMARY KEY,
      operator_id TEXT,
      name TEXT NOT NULL,
      description TEXT,
      capabilities TEXT,
      endpoint_url TEXT,
      pricing TEXT,
      status TEXT DEFAULT 'pending',
      health_check_passed_at INTEGER,
      health_check_required_by INTEGER,
      created_at INTEGER,
      updated_at INTEGER,
      wallet_id TEXT,
      health_endpoint_url TEXT,
      apiKeyHash TEXT,
      rating REAL,
      review_count INTEGER DEFAULT 0,
      health_status TEXT DEFAULT 'offline',
      last_health_check TEXT,
      response_time_ms INTEGER,
      uptime_percent REAL DEFAULT 0,
      featured INTEGER DEFAULT 0,
      featured_until INTEGER
    )
  `);
  console.log('[db] Agents table created with all required fields');
} catch (err) {
  console.log('[db] Agents table may already exist');
}

// Add health check columns to existing agents table if needed
try {
  db.exec(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'`);
  db.exec(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS health_check_passed_at INTEGER`);
  db.exec(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS health_check_required_by INTEGER`);
  db.exec(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS rating REAL`);
  db.exec(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0`);
  db.exec(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS health_status TEXT DEFAULT 'offline'`);
  db.exec(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_health_check TEXT`);
  db.exec(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS response_time_ms INTEGER`);
  db.exec(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS uptime_percent REAL DEFAULT 0`);
  db.exec(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS featured INTEGER DEFAULT 0`);
  db.exec(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS featured_until INTEGER`);
  console.log('[db] Added all missing columns to agents table');
} catch (err) {
  console.log('[db] Agents table columns may already exist:', err.message);
}

// Create agent_health_history table for daily health snapshots
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_health_history (
      id INTEGER PRIMARY KEY,
      agent_id INTEGER NOT NULL,
      snapshot_date TEXT NOT NULL,
      health_check_pass_rate REAL DEFAULT 0,
      avg_response_time_ms INTEGER,
      uptime_percent REAL DEFAULT 0,
      reliability_score INTEGER DEFAULT 0,
      created_at INTEGER,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
      UNIQUE(agent_id, snapshot_date)
    )
  `);
  console.log('[db] Agent health history table created');
} catch (err) {
  console.log('[db] Agent health history table may already exist:', err.message);
}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS webhook_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id INTEGER NOT NULL,
      operator_id TEXT NOT NULL,
      status TEXT NOT NULL,
      response_code INTEGER,
      retry_count INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
      FOREIGN KEY (operator_id) REFERENCES operators(id) ON DELETE CASCADE
    )
  `);
  console.log('[db] Webhook logs table created');
} catch (err) {
  console.log('[db] Webhook logs table may already exist:', err.message);
}

try {
  ensureTableColumns('webhook_logs', [
    ['response_code', 'INTEGER'],
    ['retry_count', 'INTEGER NOT NULL DEFAULT 0'],
    ['error_message', 'TEXT'],
  ]);
  db.exec('CREATE INDEX IF NOT EXISTS idx_webhook_logs_operator_created_at ON webhook_logs(operator_id, created_at DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_webhook_logs_agent_created_at ON webhook_logs(agent_id, created_at DESC)');
} catch (err) {
  console.log('[db] Webhook logs columns may already exist:', err.message);
}

// Add reliability_score column to agents table if needed
try {
  db.exec(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS reliability_score INTEGER DEFAULT 0`);
  console.log('[db] Added reliability_score column to agents table');
} catch (err) {
  console.log('[db] Reliability score column may already exist:', err.message);
}

// Create reviews table for user ratings and reviews
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY,
      agent_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      review_text TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
      UNIQUE(agent_id, user_id)
    )
  `);
  console.log('[db] Reviews table created');
} catch (err) {
  console.log('[db] Reviews table may already exist:', err.message);
}

// Create agent_usage table for usage tracking (billing/analytics)
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_usage (
      id INTEGER PRIMARY KEY,
      agent_id TEXT NOT NULL,
      api_key_hash TEXT,
      tasks_completed INTEGER DEFAULT 0,
      tokens_used INTEGER DEFAULT 0,
      response_time_ms INTEGER DEFAULT 0,
      errors INTEGER DEFAULT 0,
      created_at INTEGER,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
    )
  `);
  console.log('[db] Agent usage tracking table created');
} catch (err) {
  console.log('[db] Agent usage table may already exist:', err.message);
}

// Create usage_billing table for metered API billing
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_billing (
      id INTEGER PRIMARY KEY,
      user_id TEXT NOT NULL,
      tier TEXT DEFAULT 'starter',
      monthly_quota INTEGER DEFAULT 10000,
      overage_rate REAL DEFAULT 0.001,
      current_usage INTEGER DEFAULT 0,
      last_reset INTEGER NOT NULL,
      created_at INTEGER,
      updated_at INTEGER,
      FOREIGN KEY (user_id) REFERENCES operators(id) ON DELETE CASCADE
    )
  `);
  console.log('[db] Usage billing table created');
} catch (err) {
  console.log('[db] Usage billing table may already exist:', err.message);
}

// Create invoices table for monthly statements
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY,
      user_id TEXT NOT NULL,
      period_start INTEGER NOT NULL,
      period_end INTEGER NOT NULL,
      total_requests INTEGER DEFAULT 0,
      quota INTEGER DEFAULT 0,
      overage_requests INTEGER DEFAULT 0,
      overage_charge REAL DEFAULT 0,
      subtotal REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      pdf_url TEXT,
      status TEXT DEFAULT 'draft',
      created_at INTEGER,
      FOREIGN KEY (user_id) REFERENCES operators(id) ON DELETE CASCADE
    )
  `);
  console.log('[db] Invoices table created');
} catch (err) {
  console.log('[db] Invoices table may already exist:', err.message);
}

// Create usage_logs table for detailed request tracking
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_logs (
      id INTEGER PRIMARY KEY,
      user_id TEXT NOT NULL,
      request_type TEXT DEFAULT 'api_call',
      endpoint TEXT,
      timestamp INTEGER NOT NULL,
      created_at INTEGER,
      FOREIGN KEY (user_id) REFERENCES operators(id) ON DELETE CASCADE
    )
  `);
  console.log('[db] Usage logs table created');
} catch (err) {
  console.log('[db] Usage logs table may already exist:', err.message);
}

// Create api_keys table for agent API key management
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY,
      agent_id TEXT NOT NULL,
      key_hash TEXT UNIQUE NOT NULL,
      key_prefix TEXT NOT NULL,
      label TEXT,
      last_used_at INTEGER,
      created_at INTEGER,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
    )
  `);
  console.log('[db] API keys table created');
} catch (err) {
  console.log('[db] API keys table may already exist:', err.message);
}

// Add label column if it doesn't exist (migration)
try {
  db.exec(`
    ALTER TABLE api_keys ADD COLUMN label TEXT
  `);
  console.log('[db] Added label column to api_keys');
} catch (err) {
  // Column may already exist
  console.log('[db] Label column may already exist:', err.message);
}

// Search analytics table for Algolia query tracking
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS search_analytics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL,
      filters TEXT,
      results_count INTEGER DEFAULT 0,
      response_time_ms INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);
  console.log('[db] Search analytics table created');
} catch (err) {
  console.log('[db] Search analytics table may already exist:', err.message);
}

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

try {
  if (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'analytics_events'").get()) {
    ensureTableColumns('analytics_events', [
      ['attribution_source', 'TEXT'],
      ['attribution_medium', 'TEXT'],
      ['attribution_campaign', 'TEXT'],
      ['attribution_content', 'TEXT'],
      ['metadata', 'TEXT'],
    ]);
  }
} catch (err) {
  console.log('[db] Analytics events attribution columns may already exist:', err.message);
}

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
