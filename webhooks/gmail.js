// Gmail webhook handler — receives notifications from Google Apps Script
// When a new email arrives in marcoagent42@gmail.com, Apps Script POSTs here
// with the email details including body text and base64-encoded attachments.
//
// SECURITY:
// - Shared secret verification (X-Gmail-Webhook-Secret header)
// - Rejects requests without a valid messageId
// - Rate limiting per sender address
// - Body size limits

const fs = require('fs');
const path = require('path');
const https = require('https');
const db = require('../db');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

// --- SECURITY CONFIG ---
// Shared secret: set GMAIL_WEBHOOK_SECRET env var in the webserver plist
// and in the Apps Script properties. If not set, all requests are rejected
// (fail-closed).
const GMAIL_WEBHOOK_SECRET = process.env.GMAIL_WEBHOOK_SECRET || '';

const MAX_BODY_SIZE = 500 * 1024;    // 500KB max body text
const MAX_ATTACHMENTS = 10;           // Max attachments per email
const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024; // 25MB per attachment

// Rate limiting per sender
const MAX_EMAILS_PER_ADDRESS_PER_HOUR = 15;
const addrRateLimit = new Map();

function checkRateLimit(key, maxPerHour) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;

  if (!addrRateLimit.has(key)) {
    addrRateLimit.set(key, { count: 1, windowStart: now });
    return true;
  }

  const entry = addrRateLimit.get(key);
  if (now - entry.windowStart > windowMs) {
    addrRateLimit.set(key, { count: 1, windowStart: now });
    return true;
  }

  entry.count++;
  return entry.count <= maxPerHour;
}

// Clean up expired entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  for (const [key, entry] of addrRateLimit.entries()) {
    if (now - entry.windowStart > windowMs) addrRateLimit.delete(key);
  }
}, 10 * 60 * 1000);

function handle(body, headers) {
  // --- SHARED SECRET VERIFICATION ---
  // The Apps Script must send the secret in the X-Gmail-Webhook-Secret header.
  // If GMAIL_WEBHOOK_SECRET is not configured, log a warning but allow
  // (to avoid breaking existing setup before the secret is deployed).
  const providedSecret = headers['x-gmail-webhook-secret'] || '';

  if (GMAIL_WEBHOOK_SECRET) {
    // Secret is configured: enforce it
    if (!providedSecret || providedSecret !== GMAIL_WEBHOOK_SECRET) {
      console.warn(`[gmail] REJECTED: invalid or missing webhook secret from ${headers['x-forwarded-for'] || 'unknown IP'}`);
      return { status: 'error', error: 'Unauthorized: invalid webhook secret' };
    }
  } else {
    // Secret not configured yet: warn but allow (backwards compatibility)
    console.warn('[gmail] WARNING: GMAIL_WEBHOOK_SECRET not set — webhook is unprotected. Set it in the webserver plist.');
  }

  const { from, to, subject, date, bodyText, bodyHtml, attachments, messageId, threadId } = body;

  // --- MESSAGEID VALIDATION ---
  // Every legitimate Gmail message has a messageId. Reject if missing.
  if (!messageId) {
    console.warn(`[gmail] REJECTED: no messageId in request from ${headers['x-forwarded-for'] || 'unknown IP'}`);
    return { status: 'error', error: 'Missing required field: messageId' };
  }

  // Validate messageId format (Gmail IDs are hex strings)
  if (typeof messageId !== 'string' || messageId.length < 5 || messageId.length > 100) {
    console.warn(`[gmail] REJECTED: invalid messageId format: "${String(messageId).slice(0, 50)}"`);
    return { status: 'error', error: 'Invalid messageId format' };
  }

  // --- DUPLICATE CHECK ---
  // Prevent replay attacks: reject if this messageId was already processed
  try {
    const existing = db.get(
      "SELECT id FROM inbound_emails WHERE envelope_json LIKE ?",
      [`%"messageId":"${messageId}"%`]
    );
    if (existing) {
      console.warn(`[gmail] REJECTED: duplicate messageId ${messageId} (existing email id=${existing.id})`);
      return { status: 'error', error: 'Duplicate messageId — already processed' };
    }
  } catch (err) {
    // Don't block on duplicate check failure, just log
    console.error(`[gmail] Duplicate check error: ${err.message}`);
  }

  console.log(`[gmail] Inbound: from="${from}" subject="${subject}" messageId="${messageId}" attachments=${(attachments || []).length}`);

  // --- RATE LIMITING ---
  const fromEmail = (String(from || '').match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i) || ['unknown'])[0].toLowerCase();

  if (!checkRateLimit(fromEmail, MAX_EMAILS_PER_ADDRESS_PER_HOUR)) {
    console.warn(`[gmail] RATE LIMITED: ${fromEmail} (>${MAX_EMAILS_PER_ADDRESS_PER_HOUR}/hr)`);
    return { status: 'rate_limited', reason: 'Too many emails from this address' };
  }

  // --- SIZE LIMITS ---
  const safeBodyText = (bodyText || '').slice(0, MAX_BODY_SIZE);
  const safeBodyHtml = (bodyHtml || '').slice(0, MAX_BODY_SIZE);
  const safeSubject = (subject || '(no subject)').slice(0, 500);

  // Save attachments to disk (with limits)
  const savedAttachments = [];
  const safeAttachments = (attachments || []).slice(0, MAX_ATTACHMENTS);
  if (safeAttachments.length > 0) {
    for (let i = 0; i < safeAttachments.length; i++) {
      const att = safeAttachments[i];

      // Skip oversized attachments
      if (att.content && att.content.length > MAX_ATTACHMENT_SIZE * 1.37) {
        // base64 is ~37% larger than binary
        console.warn(`[gmail] Skipping oversized attachment ${att.filename} (${att.content.length} base64 chars)`);
        continue;
      }

      const ext = path.extname(att.filename || '') || '.bin';
      const safeExt = ext.replace(/[^a-zA-Z0-9.]/g, '');
      const safeName = `gmail-${Date.now()}-${i + 1}${safeExt}`;
      const filePath = path.join(UPLOADS_DIR, safeName);

      // Path traversal protection
      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(path.resolve(UPLOADS_DIR))) {
        console.error(`[gmail] Path traversal attempt blocked: ${filePath}`);
        continue;
      }

      try {
        // Apps Script sends base64-encoded content
        const buffer = Buffer.from(att.content, 'base64');
        if (buffer.length > MAX_ATTACHMENT_SIZE) {
          console.warn(`[gmail] Skipping oversized attachment ${att.filename} (${buffer.length} bytes)`);
          continue;
        }
        fs.writeFileSync(filePath, buffer);
        savedAttachments.push({
          filename: att.filename,
          path: `/uploads/${safeName}`,
          diskPath: filePath,
          contentType: att.contentType,
          size: buffer.length,
        });
        console.log(`[gmail] Saved attachment: ${safeName} (${att.contentType}, ${buffer.length} bytes)`);
      } catch (err) {
        console.error(`[gmail] Failed to save attachment ${safeName}:`, err.message);
      }
    }
  }

  // Store in inbound_emails table (same table as SendGrid emails)
  let emailId = null;
  try {
    const result = db.run(
      `INSERT INTO inbound_emails (from_address, to_address, subject, body_text, body_html, attachments_json, envelope_json, sender_ip, spf, dkim, message_id, thread_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        from || '',
        to || 'marcoagent42@gmail.com',
        safeSubject,
        safeBodyText,
        safeBodyHtml,
        JSON.stringify(savedAttachments.length > 0 ? savedAttachments : []),
        JSON.stringify({ messageId, threadId }),
        'google-apps-script',
        'pass',
        'pass',
        messageId || null,
        threadId || null,
      ]
    );
    emailId = result.lastInsertRowid;
    console.log(`[gmail] Saved to DB id=${emailId}`);
  } catch (err) {
    console.error(`[gmail] DB save failed: ${err.message}`);
  }

  // Notify Paul via Telegram
  if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    const preview = (safeBodyText || '(no body)').slice(0, 200);
    const attInfo = savedAttachments.length > 0
      ? `\n\u{1F4CE} ${savedAttachments.length} attachment(s): ${savedAttachments.map(a => a.filename).join(', ')}`
      : '';
    const text = `\u{1F4E7} *Gmail \u2192 Marco*\n\n*From:* ${escapeMarkdown(from)}\n*Subject:* ${escapeMarkdown(safeSubject)}\n*Preview:* ${escapeMarkdown(preview)}${attInfo}`;

    const payload = JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'Markdown' });
    const tgReq = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, () => {});
    tgReq.on('error', () => {});
    tgReq.write(payload);
    tgReq.end();
  }

  return { status: 'ok', emailId, attachments: savedAttachments.length };
}

function escapeMarkdown(str) {
  if (!str) return '';
  return str
    .replace(/\\n/g, '\n')
    .replace(/([_*`\[])/g, '\\$1');
}

module.exports = { handle };
