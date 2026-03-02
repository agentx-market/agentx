-- 009_email_hardening.sql
-- Add threading columns to inbound_emails + create outbound_emails table

-- Add message_id and thread_id columns
ALTER TABLE inbound_emails ADD COLUMN message_id TEXT;
ALTER TABLE inbound_emails ADD COLUMN thread_id TEXT;

-- Indexes for threading lookups
CREATE INDEX IF NOT EXISTS idx_inbound_emails_message_id ON inbound_emails(message_id);
CREATE INDEX IF NOT EXISTS idx_inbound_emails_thread_id ON inbound_emails(thread_id);

-- Backfill from envelope_json for Gmail emails (envelope contains {"messageId":"...","threadId":"..."})
UPDATE inbound_emails
SET message_id = json_extract(envelope_json, '$.messageId'),
    thread_id = json_extract(envelope_json, '$.threadId')
WHERE envelope_json LIKE '%messageId%'
  AND message_id IS NULL;

-- Outbound email log
CREATE TABLE IF NOT EXISTS outbound_emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_address TEXT NOT NULL,
  from_address TEXT NOT NULL DEFAULT 'support@agentx.market',
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  in_reply_to TEXT,
  references_header TEXT,
  inbound_email_id INTEGER,
  sendgrid_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  error_text TEXT,
  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inbound_email_id) REFERENCES inbound_emails(id)
);

CREATE INDEX IF NOT EXISTS idx_outbound_emails_inbound_id ON outbound_emails(inbound_email_id);
CREATE INDEX IF NOT EXISTS idx_outbound_emails_sent_at ON outbound_emails(sent_at);
