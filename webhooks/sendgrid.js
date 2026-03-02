// SendGrid Inbound Parse webhook handler
// Receives inbound emails forwarded by SendGrid as multipart/form-data
// Fields: from, to, subject, text, html, envelope, attachments, sender_ip, SPF, dkim
//
// SECURITY: Rate limiting per sender IP and email address.
// Rejects oversized payloads. Logs suspicious patterns.

const https = require('https');
const fs = require('fs');
const path = require('path');
const db = require('../db');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

// --- RATE LIMITING CONFIG ---
const MAX_EMAILS_PER_IP_PER_HOUR = 30;       // Per sender IP
const MAX_EMAILS_PER_ADDRESS_PER_HOUR = 15;  // Per from-address
const MAX_BODY_SIZE = 500 * 1024;            // 500KB max body text
const MAX_SUBJECT_LENGTH = 500;              // 500 chars max subject

// In-memory rate limit stores (cleared on restart, which is acceptable)
const ipRateLimit = new Map();   // ip -> { count, windowStart }
const addrRateLimit = new Map(); // email -> { count, windowStart }

// Suspicious patterns to log (potential abuse or injection)
const SUSPICIOUS_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|system)\s+(instructions|rules|prompt)/i,
  /you are now\b/i,
  /act as\b/i,
  /\[INST\]/i,
  /<<SYS>>/i,
  /SYSTEM:\s/i,
  /<\|im_start\|>/i,
  /execute\s*:/i,
  /run\s+command/i,
  /curl\s+-/i,
  /wget\s+http/i,
  /rm\s+-rf/i,
  /DROP\s+TABLE/i,
  /;\s*DELETE\s+FROM/i,
];

// Addresses that trigger Telegram notification to Paul
const IMPORTANT_RECIPIENTS = [
  'paul@agentx.market',
  'support@agentx.market',
  'marco@agentx.market',
  'hello@agentx.market',
];

/**
 * Check rate limit for a given key. Returns true if allowed, false if exceeded.
 */
function checkRateLimit(store, key, maxPerHour) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour

  if (!store.has(key)) {
    store.set(key, { count: 1, windowStart: now });
    return true;
  }

  const entry = store.get(key);

  // Reset window if expired
  if (now - entry.windowStart > windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return true;
  }

  entry.count++;
  if (entry.count > maxPerHour) {
    return false;
  }

  return true;
}

/**
 * Clean up expired rate limit entries (call periodically)
 */
function cleanupRateLimits() {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  for (const [key, entry] of ipRateLimit.entries()) {
    if (now - entry.windowStart > windowMs) ipRateLimit.delete(key);
  }
  for (const [key, entry] of addrRateLimit.entries()) {
    if (now - entry.windowStart > windowMs) addrRateLimit.delete(key);
  }
}
// Clean up every 10 minutes
setInterval(cleanupRateLimits, 10 * 60 * 1000);

/**
 * Check email body for suspicious patterns and log them.
 */
function checkSuspiciousContent(from, subject, body) {
  const fullText = `${subject || ''} ${body || ''}`;
  const found = [];
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(fullText)) {
      found.push(pattern.source);
    }
  }
  if (found.length > 0) {
    console.warn(`[sendgrid] SUSPICIOUS content from "${from}": matched ${found.length} pattern(s): ${found.join(', ')}`);
  }
  return found;
}

function notifyTelegram(from, to, subject, bodyPreview) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('[sendgrid] Telegram not configured, skipping notification');
    return;
  }

  const text = `\u{1F4E8} *Inbound Email*\n\n` +
    `*From:* ${escapeMarkdown(from)}\n` +
    `*To:* ${escapeMarkdown(to)}\n` +
    `*Subject:* ${escapeMarkdown(subject)}\n` +
    `*Preview:* ${escapeMarkdown(bodyPreview.slice(0, 300))}`;

  const payload = JSON.stringify({
    chat_id: TELEGRAM_CHAT_ID,
    text,
    parse_mode: 'Markdown',
  });

  const tgReq = https.request({
    hostname: 'api.telegram.org',
    path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, (res) => {
    if (res.statusCode !== 200) {
      console.error(`[sendgrid] Telegram notify returned ${res.statusCode}`);
    }
  });
  tgReq.on('error', (err) => console.error('[sendgrid] Telegram notify failed:', err.message));
  tgReq.write(payload);
  tgReq.end();
}

function escapeMarkdown(str) {
  if (!str) return '';
  // Only escape chars that Telegram Markdown actually requires: _ * ` [
  // Also replace literal \n with actual newlines for readability
  return str
    .replace(/\\n/g, '\n')
    .replace(/([_*`\[])/g, '\\$1');
}

/**
 * Save uploaded attachment files to disk.
 * @param {Array} files - multer file objects (req.files)
 * @param {number} emailId - database row id for naming
 * @returns {Array} saved file info [{filename, path, contentType, size}]
 */
function saveAttachments(files, emailId) {
  if (!files || files.length === 0) return [];
  const saved = [];
  for (const file of files) {
    const ext = path.extname(file.originalname || '') || '.bin';
    // Sanitize extension to prevent path traversal
    const safeExt = ext.replace(/[^a-zA-Z0-9.]/g, '');
    const safeName = `email-${emailId}-${saved.length + 1}${safeExt}`;
    const filePath = path.join(UPLOADS_DIR, safeName);

    // Verify the resolved path is within UPLOADS_DIR (prevent path traversal)
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(path.resolve(UPLOADS_DIR))) {
      console.error(`[sendgrid] Path traversal attempt blocked: ${filePath}`);
      continue;
    }

    try {
      fs.writeFileSync(filePath, file.buffer);
      saved.push({
        filename: file.originalname || safeName,
        path: `/uploads/${safeName}`,
        diskPath: filePath,
        contentType: file.mimetype || 'application/octet-stream',
        size: file.size || file.buffer.length,
      });
      console.log(`[sendgrid] Saved attachment: ${safeName} (${file.mimetype}, ${file.size} bytes)`);
    } catch (err) {
      console.error(`[sendgrid] Failed to save attachment ${safeName}:`, err.message);
    }
  }
  return saved;
}

/**
 * Handle inbound email from SendGrid Inbound Parse.
 * Called by the multer-equipped route in server.js.
 * @param {object} fields - parsed form fields from multer (req.body after multer)
 * @param {object} headers - request headers
 * @param {Array} files - multer file objects (req.files) for attachments
 * @returns {object} response payload
 */
function handle(fields, headers, files) {
  const from = fields.from || '';
  const to = fields.to || '';
  const subject = (fields.subject || '(no subject)').slice(0, MAX_SUBJECT_LENGTH);
  const bodyText = (fields.text || '').slice(0, MAX_BODY_SIZE);
  const bodyHtml = (fields.html || '').slice(0, MAX_BODY_SIZE);
  const envelope = fields.envelope || '{}';
  const senderIp = fields.sender_ip || headers['x-forwarded-for'] || '';
  const spf = fields.SPF || '';
  const dkim = fields.dkim || '{}';

  // Extract Message-ID from raw headers (SendGrid passes full headers as text)
  const rawHeaders = fields.headers || '';
  const messageIdMatch = rawHeaders.match(/^Message-ID:\s*<?([^>\r\n]+)>?\s*$/mi);
  const messageId = messageIdMatch ? messageIdMatch[1].trim() : null;

  // Parse attachment count from the attachments field (integer count) and attachment-info (JSON)
  const attachmentCount = parseInt(fields.attachments || '0', 10);
  const attachmentInfo = fields['attachment-info'] || '{}';

  console.log(`[sendgrid] Inbound email: from="${from}" to="${to}" subject="${subject}" ip="${senderIp}" attachments=${attachmentCount} files=${(files || []).length}`);

  // --- RATE LIMITING ---
  // Extract email address from "Name <email>" format
  const fromEmail = (from.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i) || ['unknown'])[0].toLowerCase();

  if (senderIp && !checkRateLimit(ipRateLimit, senderIp, MAX_EMAILS_PER_IP_PER_HOUR)) {
    console.warn(`[sendgrid] RATE LIMITED by IP: ${senderIp} (>${MAX_EMAILS_PER_IP_PER_HOUR}/hr)`);
    return { status: 'rate_limited', reason: 'Too many emails from this IP' };
  }

  if (!checkRateLimit(addrRateLimit, fromEmail, MAX_EMAILS_PER_ADDRESS_PER_HOUR)) {
    console.warn(`[sendgrid] RATE LIMITED by address: ${fromEmail} (>${MAX_EMAILS_PER_ADDRESS_PER_HOUR}/hr)`);
    return { status: 'rate_limited', reason: 'Too many emails from this address' };
  }

  // --- SUSPICIOUS CONTENT CHECK ---
  const suspiciousPatterns = checkSuspiciousContent(from, subject, bodyText);

  // Save to database
  let emailId = null;
  try {
    const result = db.run(
      `INSERT INTO inbound_emails (from_address, to_address, subject, body_text, body_html, attachments_json, envelope_json, sender_ip, spf, dkim, message_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [from, to, subject, bodyText, bodyHtml, attachmentInfo, envelope, senderIp, spf, dkim, messageId]
    );
    emailId = result.lastInsertRowid;
    console.log(`[sendgrid] Saved inbound email id=${emailId}${suspiciousPatterns.length > 0 ? ' [SUSPICIOUS]' : ''}`);
  } catch (err) {
    console.error(`[sendgrid] DB save failed: ${err.message}`);
    // Still return 200 so SendGrid doesn't retry — the email is logged to stdout
  }

  // Save attachment files to disk and update DB with file paths
  if (emailId && files && files.length > 0) {
    const savedFiles = saveAttachments(files, emailId);
    if (savedFiles.length > 0) {
      try {
        db.run(
          `UPDATE inbound_emails SET attachments_json = ? WHERE id = ?`,
          [JSON.stringify(savedFiles), emailId]
        );
        console.log(`[sendgrid] Updated email ${emailId} with ${savedFiles.length} attachment paths`);
      } catch (err) {
        console.error(`[sendgrid] Failed to update attachments for email ${emailId}:`, err.message);
      }
    }
  }

  // Notify Paul via Telegram for emails to important addresses
  const toLower = to.toLowerCase();
  const isImportant = IMPORTANT_RECIPIENTS.some(addr => toLower.includes(addr));
  if (isImportant) {
    const suspiciousNote = suspiciousPatterns.length > 0 ? `\n\n\u26A0\uFE0F SUSPICIOUS: matched ${suspiciousPatterns.length} injection pattern(s)` : '';
    notifyTelegram(from, to, subject, (bodyText || '(HTML only)') + suspiciousNote);
  }

  // Always return 200 — SendGrid retries on non-2xx
  return { status: 'ok', from, subject };
}

module.exports = { handle };
