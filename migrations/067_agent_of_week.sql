CREATE TABLE IF NOT EXISTS featured_editorial_schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start INTEGER NOT NULL UNIQUE,
  week_end INTEGER NOT NULL,
  selected_agent_id INTEGER NOT NULL,
  active_agent_id INTEGER,
  status TEXT NOT NULL DEFAULT 'scheduled',
  emergency_override INTEGER NOT NULL DEFAULT 0,
  emergency_note TEXT,
  activated_at INTEGER,
  activated_by_operator_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (selected_agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (active_agent_id) REFERENCES agents(id) ON DELETE SET NULL,
  FOREIGN KEY (activated_by_operator_id) REFERENCES operators(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_featured_editorial_schedule_window
  ON featured_editorial_schedule(week_start, week_end, status);
