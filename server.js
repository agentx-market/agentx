const express = require('express');

const db = require("./db");
const path = require('path');
const fs = require('fs');
const https = require('https');

const app = express();
const PORT = process.env.MARCO_WEB_PORT || 3000;
const WEBHOOKS_DIR = path.join(__dirname, 'webhooks');
const SUBMISSIONS_DIR = path.join(__dirname, 'submissions');
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

// Ensure submissions directory exists
if (!fs.existsSync(SUBMISSIONS_DIR)) fs.mkdirSync(SUBMISSIONS_DIR, { recursive: true });

// Parse JSON and URL-encoded bodies
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} ${ms}ms`);
  });
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// Contact form submissions
app.post('/api/contact', (req, res) => {
  const { firstName, lastName, email, company, subject, message } = req.body;
  if (!email || !message) {
    return res.status(400).json({ error: 'Email and message are required' });
  }

  const submission = {
    firstName, lastName, email, company, subject, message,
    timestamp: new Date().toISOString(),
    ip: req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.ip,
  };

  // Save to file
  const filename = `${Date.now()}-${email.replace(/[^a-z0-9]/gi, '_')}.json`;
  fs.writeFileSync(path.join(SUBMISSIONS_DIR, filename), JSON.stringify(submission, null, 2));
  console.log(`[contact] New submission from ${email} — ${filename}`);

  // Notify Paul via Telegram
  const text = `📬 *New AgentX Contact*\n\n` +
    `*From:* ${firstName || ''} ${lastName || ''}\n` +
    `*Email:* ${email}\n` +
    `*Company:* ${company || 'n/a'}\n` +
    `*Topic:* ${subject || 'n/a'}\n` +
    `*Message:* ${message.slice(0, 500)}`;

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
  }, () => {});
  tgReq.on('error', (err) => console.error('[contact] Telegram notify failed:', err.message));
  tgReq.write(payload);
  tgReq.end();

  res.json({ status: 'ok' });
});

// Webhook receiver — POST /webhooks/:service
app.post('/webhooks/:service', (req, res) => {
  const { service } = req.params;
  const handlerPath = path.join(WEBHOOKS_DIR, `${service}.js`);

  console.log(`[webhook] ${service} — ${JSON.stringify(req.body).slice(0, 200)}`);

  // Try to load a dedicated handler
  if (fs.existsSync(handlerPath)) {
    try {
      // Clear require cache so handlers can be updated without restart
      delete require.cache[require.resolve(handlerPath)];
      const handler = require(handlerPath);
      const result = handler.handle(req.body, req.headers);
      return res.json(result);
    } catch (err) {
      console.error(`[webhook] ${service} handler error:`, err.message);
      return res.status(500).json({ error: 'handler_error', message: err.message });
    }
  }

  // No dedicated handler — just acknowledge
  console.log(`[webhook] ${service} — no handler, acknowledged`);
  res.json({ status: 'ok', service, handled: false });
});

// Static files from public/ (with clean URL extensions)
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// Start
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Marco web server listening on 0.0.0.0:${PORT}`);
});
