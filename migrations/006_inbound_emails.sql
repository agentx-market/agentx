-- Inbound email storage for SendGrid Inbound Parse
-- Created: 2026-02-28

CREATE TABLE IF NOT EXISTS inbound_emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_address TEXT NOT NULL,
  to_address TEXT,
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  attachments_json TEXT,
  envelope_json TEXT,
  sender_ip TEXT,
  spf TEXT,
  dkim TEXT,
  received_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inbound_emails_from ON inbound_emails(from_address);
CREATE INDEX IF NOT EXISTS idx_inbound_emails_to ON inbound_emails(to_address);
CREATE INDEX IF NOT EXISTS idx_inbound_emails_received ON inbound_emails(received_at);
