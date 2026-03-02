const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const db = require("./db");
const email = require("./email");
const { generateApiKey, hashApiKey } = require('./auth');
const authMiddleware = require('./middleware/auth');
const { createSessionToken, sessionMiddleware } = require('./middleware/sessionMiddleware');
const oauthHandler = require('./lib/oauth-handler');
const oauthConfig = require('./config/oauth');
const abuseLimits = require('./config/abuse-limits');
const { registrationRateLimit, canOperatorRegister } = require('./middleware/registrationRateLimit');
const { trackOperatorIp, checkIpThreshold, alertMarcoIpAbuse } = require('./lib/ip-tracker');
const { verifyOperatorEligibility, verifyAgentHealthBeforeBonus } = require('./lib/bonus-verification');
const path = require('path');
const fs = require('fs');
const https = require('https');

// Background jobs
const { runHealthMonitor } = require('./jobs/health-monitor-cron');
const { cleanupHealthHistory } = require('./jobs/health-history-cleanup');
const { calculateUptime } = require('./lib/uptime-calc');

// Error handling middleware
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.MARCO_WEB_PORT || 3000;

// Trust Cloudflare proxy — required for accurate req.ip behind the tunnel
app.set('trust proxy', 1);

// --- SECURITY HEADERS (helmet) ---
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://js.stripe.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.stripe.com"],
      frameSrc: ["https://js.stripe.com"],
    },
  },
  crossOriginEmbedderPolicy: false,  // Allow loading external resources (CDN, fonts)
}));

// --- RATE LIMITERS ---
// Public endpoint rate limiter: 100 requests per minute per IP
const publicLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests',
    message: 'Rate limit exceeded. Maximum 100 requests per minute for public endpoints.',
    retry_after: 60  // seconds until reset
  },
  skip: (req) => {
    // Skip rate limiting for health checks, static assets, and localhost
    if (req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1') return true;
    return req.path === '/health' || req.path.startsWith('/css') || req.path.startsWith('/js') || req.path.startsWith('/images');
  },
});

// Authenticated agent rate limiter: 1000 requests per minute per agent
const authenticatedLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests',
    message: 'Rate limit exceeded. Maximum 1000 requests per minute for authenticated agents.',
    retry_after: 60  // seconds until reset
  },
  keyGenerator: (req) => {
    // Use agent ID as the rate limit key for authenticated requests
    return req.agentId ? `agent:${req.agentId}` : `ip:${req.ip}`;
  },
  validate: { keyGeneratorIpFallback: false },
});

// Webhook rate limiter: 60 per 15 minutes per IP (SendGrid can burst)
const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many webhook requests', retry_after: 900 },
  keyGenerator: (req) => req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.ip,
  validate: { keyGeneratorIpFallback: false },
});

// Auth endpoint limiter: 20 per 15 minutes per IP (prevent brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts', retry_after: 900 },
});

// Waitlist/contact limiter: 5 per 15 minutes per IP (prevent spam)
const formLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submissions', retry_after: 900 },
});

// Apply public rate limiter to all routes first (catches unauthenticated requests)
app.use('/api', publicLimiter);

// Set up EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
const WEBHOOKS_DIR = path.join(__dirname, 'webhooks');
const SUBMISSIONS_DIR = path.join(__dirname, 'submissions');
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

// Stripe webhook needs raw body for signature verification — must come BEFORE json parser
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
if (STRIPE_WEBHOOK_SECRET) {
  const Stripe = require('stripe');
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error(`[stripe] Signature verification failed: ${err.message}`);
      return res.status(400).json({ error: 'Invalid signature' });
    }

    // Load and run the stripe webhook handler
    try {
      delete require.cache[require.resolve('./webhooks/stripe')];
      const handler = require('./webhooks/stripe');
      const result = handler.handle(event, req.headers);
      console.log(`[stripe] Processed: ${event.type}`);
      res.json(result);
    } catch (err) {
      console.error(`[stripe] Handler error: ${err.message}`);
      res.status(500).json({ error: 'handler_error' });
    }
  });
}

// Ensure submissions directory exists
if (!fs.existsSync(SUBMISSIONS_DIR)) fs.mkdirSync(SUBMISSIONS_DIR, { recursive: true });

// Parse JSON and URL-encoded bodies (1MB limit — sufficient for API payloads)
// Gmail webhook may send larger payloads (base64 attachments), handled by multer separately
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Session management
app.use(cookieParser());
app.use(sessionMiddleware);

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

// Auth middleware for agent-specific routes is applied inline on each handler below

// Auth middleware that accepts either session cookie OR API key
const requireAuth = async (req, res, next) => {
  // If already authenticated via session cookie, proceed
  if (req.operatorId) return next();

  // Otherwise, try API key auth (X-AgentX-Key header)
  const apiKey = req.headers['x-agentx-key'];
  if (!apiKey) {
    return res.status(401).json({
      error: 'Authentication required',
      reason: 'Provide a session cookie (login via OAuth) or X-AgentX-Key header'
    });
  }

  try {
    const { verifyApiKey } = require('./auth');
    const keyPrefix = apiKey.substring(0, 8);
    const row = db.get(
      'SELECT agents.*, api_keys.key_hash FROM agents JOIN api_keys ON agents.id = api_keys.agent_id WHERE api_keys.key_prefix = ?',
      [keyPrefix]
    );
    if (!row) {
      return res.status(401).json({ error: 'Invalid API key' });
    }
    const isValid = await verifyApiKey(apiKey, row.key_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid API key' });
    }
    db.run('UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE key_hash = ?', [row.key_hash]);
    req.agentId = row.id;
    req.operatorId = row.operator_id;
    next();
  } catch (err) {
    res.status(500).json({ error: 'Auth error', details: err.message });
  }
};

// Agent registry API - POST with auth + abuse prevention
app.post('/api/agents', requireAuth, authenticatedLimiter, registrationRateLimit, async (req, res) => {
  const { name, description, capabilities, endpoint_url, pricing, tier, health_endpoint_url } = req.body;
  const operatorId = req.operatorId;

  if (!name || !endpoint_url) {
    return res.status(400).json({ error: 'name and endpoint_url are required' });
  }

  if (!operatorId) {
    return res.status(401).json({
      error: 'Not authenticated',
      reason: 'Must be logged in or provide a valid API key to register agents'
    });
  }

  try {
    // Step 1: Create lightning wallet for agent
    const lwWallet = require('./lib/lw-wallet');
    let wallet_id;
    try {
      wallet_id = lwWallet.registerAgentWallet(name);
      console.log(`[agent-register] Created wallet ${wallet_id} for agent ${name}`);
    } catch (walletErr) {
      console.error(`[agent-register] Wallet creation failed: ${walletErr.message}`);
      return res.status(500).json({ error: 'Wallet creation failed', details: walletErr.message });
    }

    // Abuse Prevention Checks
    
    // 1. Check operator eligibility with comprehensive abuse limits
    const eligibility = await verifyOperatorEligibility(operatorId);
    if (!eligibility.eligible) {
      return res.status(403).json({ 
        error: 'ineligible', 
        reason: eligibility.reason 
      });
    }

    // 2. Track IP and check threshold
    const clientIp = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.ip;
    const ipCount = await trackOperatorIp(operatorId, clientIp);
    const threshold = await checkIpThreshold(clientIp);
    if (threshold.exceeded) {
      await alertMarcoIpAbuse(clientIp, threshold.count);
    }
    console.log(`[agent-register] IP ${clientIp} tracking: ${ipCount} operators from this IP`);

    // 3. Double-check agent count for tier limits (additional safeguard)
    const agentCount = db.get(
      'SELECT COUNT(*) as count FROM agents WHERE operator_id = ? AND status = ?',
      [operatorId, 'active']
    )?.count || 0;
    
    const tierLimit = tier === 'free' ? abuseLimits.freetier.maxAgentsPerOperator : Infinity;
    if (agentCount >= tierLimit) {
      return res.status(400).json({
        error: 'Agent limit reached',
        reason: `Maximum ${tierLimit} agents allowed on free tier. Upgrade to add more.`,
        current_count: agentCount,
        limit: tierLimit
      });
    }

    // Create agent in pending state (requires health check)
    const now = Date.now();
    const healthCheckRequiredBy = now + (abuseLimits.healthCheckWindowMs);
    
    const plainKey = generateApiKey();
    const hashedKey = await hashApiKey(plainKey);
    
    const stmt = db.prepare(
      'INSERT INTO agents (operator_id, name, description, capabilities, endpoint_url, pricing, status, health_check_required_by, health_endpoint_url, wallet_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const result = stmt.run(
      operatorId,
      name,
      description || null,
      JSON.stringify(capabilities || []),
      endpoint_url,
      pricing || null,
      'pending',  // Agent starts in pending state
      healthCheckRequiredBy,
      health_endpoint_url || null,
      wallet_id,
      now,
      now
    );
    
    // Generate API key
    const keyPrefix = plainKey.substring(0, 8);
    const apiKeysStmt = db.prepare('INSERT INTO api_keys (agent_id, key_hash, key_prefix) VALUES (?, ?, ?)');
    try {
      const apiResult = apiKeysStmt.run(result.lastInsertRowid, hashedKey, keyPrefix);
      console.log('[agent-register] API key created for agent', result.lastInsertRowid);
    } catch (apiErr) {
      console.error('[agent-register] Failed to create API key:', apiErr.message);
      throw apiErr;
    }
    
    // Update operator agent count
    db.run(
      'UPDATE operator_limits SET agent_count = agent_count + 1 WHERE operator_id = ?',
      [operatorId]
    );
    
    // Step 2: Send welcome bonus (don't fail registration if this fails)
    try {
      lwWallet.sendWelcomeBonus(result.lastInsertRowid);
      console.log(`[agent-register] Welcome bonus sent to agent ${result.lastInsertRowid}`);
    } catch (bonusErr) {
      console.warn(`[agent-register] Bonus send failed for agent ${result.lastInsertRowid}: ${bonusErr.message}`);
    }
    
    res.status(201).json({
      id: result.lastInsertRowid,
      name,
      api_key: plainKey,  // Return once — never again!
      endpoint_url,
      wallet_id,
      status: 'pending',
      health_check_required_by: new Date(healthCheckRequiredBy).toISOString(),
      message: `Agent created in pending state. Complete health check at POST /api/agents/${result.lastInsertRowid}/health-check within 24h to activate and claim welcome bonus.`,
      created_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('[agent-register] Error:', err.message);
    res.status(500).json({ error: 'Registration failed', details: err.message });
  }
});

app.get('/api/agents', (req, res) => {
  try {
    const agents = db.prepare('SELECT * FROM agents ORDER BY created_at DESC').all();
    const formatted = agents.map(a => {
      const uptime = calculateUptime(a.id);
      return {
        ...a,
        capabilities: a.capabilities ? JSON.parse(a.capabilities) : [],
        healthStatus: a.health_status || 'offline',
        lastHealthCheck: a.last_health_check,
        responseTimeMs: a.response_time_ms,
        uptimePercent: uptime.uptimePercent
      };
    });
    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Agent search endpoint — MUST be before /:id to avoid being caught by the param route
app.get('/api/agents/search', async (req, res) => {
  try {
    const { q, category, pricing, minUptime, minRating, sort, limit, offset } = req.query;

    const filters = {
      category: category || 'all',
      pricing: pricing || 'all',
      minUptime: minUptime || null,
      minRating: minRating || null,
      sort: sort || 'relevance',
      limit: limit || 20,
      offset: offset || 0
    };

    const { search } = require('./lib/agent-search');
    const results = await search(q || '', filters);

    res.json({
      success: true,
      query: q,
      filters,
      count: results.length,
      results
    });
  } catch (error) {
    console.error('[search] Error:', error.message);
    res.status(500).json({ error: 'Search failed', details: error.message });
  }
});

app.get('/api/agents/:id', authMiddleware, authenticatedLimiter, (req, res) => {
  try {
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    const uptime = calculateUptime(agent.id);
    agent.capabilities = agent.capabilities ? JSON.parse(agent.capabilities) : [];
    agent.healthStatus = agent.health_status || 'offline';
    agent.lastHealthCheck = agent.last_health_check;
    agent.responseTimeMs = agent.response_time_ms;
    agent.uptimePercent = uptime.uptimePercent;
    res.json(agent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Agent health check endpoint - activates agent and makes it eligible for welcome bonus
app.post('/api/agents/:id/health-check', authMiddleware, authenticatedLimiter, async (req, res) => {
  const agentId = parseInt(req.params.id);
  const operatorId = req.operatorId;
  
  if (!agentId) {
    return res.status(400).json({ error: 'Invalid agent ID' });
  }

  try {
    const agent = db.get(
      'SELECT * FROM agents WHERE id = ?',
      [agentId]
    );

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Verify this operator owns this agent
    if (agent.operator_id !== operatorId) {
      return res.status(403).json({ 
        error: 'Forbidden',
        reason: 'You do not own this agent'
      });
    }

    // Check if health check already passed
    if (agent.health_check_passed_at) {
      return res.status(400).json({ 
        error: 'Health check already completed',
        reason: 'This agent has already passed the health check'
      });
    }

    // Check if health check window has expired
    if (Date.now() > agent.health_check_required_by) {
      return res.status(400).json({ 
        error: 'Health check window expired',
        reason: `Health check must be completed within ${abuseLimits.healthCheckWindowHours}h of registration. Agent expires and cannot claim bonus.`
      });
    }

    // Health check passed - activate agent
    const now = Date.now();
    db.run(
      'UPDATE agents SET status = ?, health_check_passed_at = ?, updated_at = ? WHERE id = ?',
      ['active', now, now, agentId]
    );

    // Award welcome bonus (10,000 sats)
    db.run(
      'INSERT INTO welcome_bonuses (operator_id, agent_id, claimed, amount_sats, created_at) VALUES (?, ?, 1, 10000, datetime("now"))',
      [operatorId, agentId]
    );

    console.log(`[health-check] Agent ${agentId} activated and bonus awarded for operator ${operatorId}`);
    
    res.json({
      success: true,
      message: 'Health check passed. Agent is now active. Welcome bonus of 10,000 sats awarded!',
      agent: {
        id: agentId,
        status: 'active',
        health_check_passed_at: new Date(now).toISOString()
      },
      bonus: {
        amount_sats: 10000,
        claimed: true
      }
    });
  } catch (err) {
    console.error('[health-check] Error:', err.message);
    res.status(500).json({ error: 'Health check failed', details: err.message });
  }
});

// Contact form submissions
app.post('/api/contact', formLimiter, (req, res) => {
  const { firstName, lastName, email, company, subject, message } = req.body;
  if (!email || !message) {
    return res.status(400).json({ error: 'Email and message are required' });
  }

  // Input validation
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }
  if (typeof message !== 'string' || message.length > 5000) {
    return res.status(400).json({ error: 'Message too long (max 5000 chars)' });
  }
  if (subject && (typeof subject !== 'string' || subject.length > 300)) {
    return res.status(400).json({ error: 'Subject too long (max 300 chars)' });
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

// Waitlist signup with welcome email
app.post('/api/waitlist', formLimiter, async (req, res) => {
  const { email: userEmail } = req.body;
  if (!userEmail) {
    return res.status(400).json({ error: 'Email is required' });
  }
  // Input validation
  if (typeof userEmail !== 'string' || userEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  try {
    db.run(
      'INSERT OR IGNORE INTO waitlist (email, ip) VALUES (?, ?)',
      [userEmail, req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.ip]
    );

    // Send welcome email
    const result = await email.sendWelcome(userEmail);
    console.log(`[waitlist] ${userEmail} signed up, email: ${result.success ? 'sent' : 'failed'}`);

    // Notify Paul via Telegram
    const count = db.get('SELECT COUNT(*) as total FROM waitlist')?.total || 0;
    const text = `🎯 *New Waitlist Signup*\n\n*Email:* ${userEmail}\n*Total:* ${count} signups`;
    const payload = JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'Markdown' });
    const tgReq = https.request({
      hostname: 'api.telegram.org', path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      method: 'POST', headers: { 'Content-Type': 'application/json' },
    }, () => {});
    tgReq.on('error', () => {});
    tgReq.write(payload);
    tgReq.end();

    res.json({ status: 'ok', message: 'Added to waitlist' });
  } catch (err) {
    console.error('[waitlist] Error:', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Create Stripe payment link (for agents to generate on-demand)
app.post('/api/create-payment-link', authLimiter, async (req, res) => {
  const { price_id, customer_email } = req.body;
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(503).json({ error: 'Stripe not configured' });
  }

  try {
    const Stripe = require('stripe');
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: price_id, quantity: 1 }],
      ...(customer_email ? { customer_email } : {}),
      success_url: 'https://agentx.market/success',
      cancel_url: 'https://agentx.market/pricing',
    });

    console.log(`[stripe] Payment link created for ${customer_email || 'anonymous'}`);
    res.json({ url: session.url });
  } catch (err) {
    console.error('[stripe] Payment link error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// SendGrid Inbound Parse — multipart/form-data (must come BEFORE generic webhook handler)
const multer = require('multer');
const sendgridUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,  // 25MB per file
    files: 10,                    // Max 10 attachments
    fields: 30,                   // Max 30 form fields
    fieldSize: 1 * 1024 * 1024,   // 1MB max per field (body text etc)
  },
});
app.post('/webhooks/sendgrid', webhookLimiter, sendgridUpload.any(), (req, res) => {
  const handlerPath = path.join(WEBHOOKS_DIR, 'sendgrid.js');
  try {
    delete require.cache[require.resolve(handlerPath)];
    const handler = require(handlerPath);
    const result = handler.handle(req.body, req.headers, req.files);
    console.log(`[webhook] sendgrid — inbound email processed`);
    res.json(result);
  } catch (err) {
    console.error(`[webhook] sendgrid handler error:`, err.message);
    // Return 200 anyway so SendGrid doesn't retry on handler errors
    res.json({ status: 'ok', error: err.message });
  }
});

// Gmail webhook — needs larger body limit for base64 attachments (must come BEFORE generic handler)
app.post('/webhooks/gmail', webhookLimiter, express.json({ limit: '30mb' }), (req, res) => {
  const handlerPath = path.join(WEBHOOKS_DIR, 'gmail.js');
  try {
    delete require.cache[require.resolve(handlerPath)];
    const handler = require(handlerPath);
    const result = handler.handle(req.body, req.headers);
    if (result.error) {
      console.log(`[webhook] gmail — rejected: ${result.error}`);
      return res.status(result.status === 'error' ? 400 : 429).json(result);
    }
    console.log(`[webhook] gmail — inbound email processed`);
    res.json(result);
  } catch (err) {
    console.error(`[webhook] gmail handler error:`, err.message);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// Webhook receiver — POST /webhooks/:service
app.post('/webhooks/:service', webhookLimiter, (req, res) => {
  const { service } = req.params;

  // Sanitize service name: only allow alphanumeric and hyphens (prevent path traversal)
  if (!/^[a-zA-Z0-9_-]+$/.test(service)) {
    console.warn(`[webhook] REJECTED: invalid service name "${service}"`);
    return res.status(400).json({ error: 'Invalid service name' });
  }

  const handlerPath = path.join(WEBHOOKS_DIR, `${service}.js`);

  // Double-check resolved path is within WEBHOOKS_DIR
  const resolvedPath = path.resolve(handlerPath);
  if (!resolvedPath.startsWith(path.resolve(WEBHOOKS_DIR))) {
    console.warn(`[webhook] REJECTED: path traversal attempt for service "${service}"`);
    return res.status(400).json({ error: 'Invalid service name' });
  }

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

// ===== OAuth Routes =====

// GitHub OAuth initiation
app.get('/auth/github', authLimiter, (req, res) => {
  const state = oauthHandler.generateState();
  const redirectUri = `https://github.com/login/oauth/authorize?client_id=${oauthConfig.github.clientID}&redirect_uri=${encodeURIComponent(oauthConfig.github.callbackURL)}&scope=user:email&state=${state}`;
  res.redirect(redirectUri);
});

// GitHub OAuth callback
app.get('/auth/github/callback', authLimiter, async (req, res) => {
  try {
    const { code, state, error } = req.query;
    if (error) return res.status(400).json({ error });
    if (!oauthHandler.verifyAndConsumeState(state)) {
      return res.status(403).json({ error: 'Invalid or expired OAuth state' });
    }

    const accessToken = await oauthHandler.exchangeGitHubCode(
      code,
      oauthConfig.github.clientID,
      oauthConfig.github.clientSecret
    );
    const user = await oauthHandler.getGitHubUser(accessToken);
    const operator = oauthHandler.findOrCreateOperator('github', user);

    const sessionToken = createSessionToken(operator.id);
    res.cookie('session', sessionToken, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.redirect('/');
  } catch (err) {
    console.error('[oauth] GitHub callback error:', err.message);
    res.status(err.status || 500).json({ error: err.reason || err.message });
  }
});

// Google OAuth initiation
app.get('/auth/google', authLimiter, (req, res) => {
  const state = oauthHandler.generateState();
  const redirectUri = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${oauthConfig.google.clientID}&redirect_uri=${encodeURIComponent(oauthConfig.google.callbackURL)}&response_type=code&scope=openid email profile&state=${state}`;
  res.redirect(redirectUri);
});

// Google OAuth callback
app.get('/auth/google/callback', authLimiter, async (req, res) => {
  try {
    const { code, state, error } = req.query;
    if (error) return res.status(400).json({ error });
    if (!oauthHandler.verifyAndConsumeState(state)) {
      return res.status(403).json({ error: 'Invalid or expired OAuth state' });
    }

    const accessToken = await oauthHandler.exchangeGoogleCode(
      code,
      oauthConfig.google.clientID,
      oauthConfig.google.clientSecret
    );
    const user = await oauthHandler.getGoogleUser(accessToken);
    const operator = oauthHandler.findOrCreateOperator('google', user);

    const sessionToken = createSessionToken(operator.id);
    res.cookie('session', sessionToken, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.redirect('/');
  } catch (err) {
    console.error('[oauth] Google callback error:', err.message);
    res.status(err.status || 500).json({ error: err.reason || err.message });
  }
});

// Logout
app.post('/auth/logout', (req, res) => {
  res.clearCookie('session');
  res.json({ ok: true });
});

// Get current operator
app.get('/api/operator', (req, res) => {
  if (!req.operatorId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const operator = db.get('SELECT id, provider, email, name, created_at FROM operators WHERE id = ?', [req.operatorId]);
  if (!operator) {
    return res.status(404).json({ error: 'Operator not found' });
  }
  res.json(operator);
});

// Agent detail pages - now handled directly below with /agents/:slug route
// (removed separate route file to consolidate)

// Blog routes
const blogRouter = require('./routes/blog');
app.use('/blog', blogRouter);

// ===== Agent Browse Page =====

// Browse API endpoint with search, category, and sort filters
app.get('/api/browse', (req, res) => {
  const { search, category, sort } = req.query;
  let query = 'SELECT id, name, description, category, uptime_percent, last_health_check FROM agents WHERE 1=1';
  const params = [];

  if (search) {
    query += ' AND (LOWER(name) LIKE ? OR LOWER(description) LIKE ?)';
    params.push(`%${search.toLowerCase()}%`, `%${search.toLowerCase()}%`);
  }

  if (category) {
    query += ' AND category = ?';
    params.push(category);
  }

  // Sorting
  const validSorts = {
    'newest': 'created_at DESC',
    'popular': 'rating DESC',
    'uptime': 'uptime_percent DESC',
    'name': 'name ASC'
  };
  const sortClause = validSorts[sort] || 'created_at DESC';
  query += ` ORDER BY ${sortClause}`;

  const agents = db.all(query, params);
  res.json({ agents, total: agents.length });
});

// Get distinct categories for filter dropdown
app.get('/api/categories', (req, res) => {
  const categories = db.all('SELECT DISTINCT category FROM agents WHERE category IS NOT NULL ORDER BY category');
  res.json(categories.map(c => c.category));
});

// Browse page route
app.get('/browse', (req, res) => {
  res.render('browse', { title: 'Browse Agents' });
});

// Agent detail page route
app.get('/agents/:slug', (req, res) => {
  const { slug } = req.params;
  const agentQueries = require('./lib/agent-queries');
  
  const agent = agentQueries.getAgentBySlug(slug);
  
  if (!agent) {
    return res.status(404).render('404', { message: 'Agent not found' });
  }
  
  const uptimeTrend = agentQueries.getAgentUptimeTrend(agent.id);
  
  res.render('agent-detail', {
    agent,
    uptimeTrend,
    uptime7d: agent.uptime_percent ? Math.round(agent.uptime_percent * 100) / 100 : 'N/A'
  });
});

// ===== Usage Tracking API =====

// POST /api/usage — agents report task completions
app.post('/api/usage', authMiddleware, authenticatedLimiter, (req, res) => {
  try {
    const { tasks_completed, tokens_used, response_time_ms, errors } = req.body;
    const agent_id = req.agentId;
    
    if (!agent_id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Validate required fields
    if (tasks_completed === undefined || tokens_used === undefined || response_time_ms === undefined) {
      return res.status(400).json({ 
        error: 'Missing required fields: tasks_completed, tokens_used, response_time_ms' 
      });
    }
    
    const usageTracker = require('./lib/usage-tracker');
    const result = usageTracker.recordUsage(agent_id, req.keyHash, {
      tasks_completed,
      tokens_used,
      response_time_ms,
      errors: errors || 0
    });
    
    res.json({ success: true, usage_id: result.usage_id, recorded_at: result.recorded_at });
  } catch (err) {
    console.error(`[usage] Error: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
});

// GET /api/usage/:agent_id — get agent usage summary
app.get('/api/usage/:agent_id', authMiddleware, authenticatedLimiter, (req, res) => {
  try {
    const agent_id = parseInt(req.params.agent_id, 10);
    
    // Only allow viewing own usage
    if (req.agentId !== agent_id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    const usageTracker = require('./lib/usage-tracker');
    const summary = usageTracker.getAgentUsageSummary(agent_id);
    const history = usageTracker.getAgentUsageHistory(agent_id, 50);
    
    res.json({ summary, history });
  } catch (err) {
    console.error(`[usage] Error: ${err.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 404 handler - must come before errorHandler
app.use(notFound);

// Error handler - must be last in middleware chain
app.use(errorHandler);

// Start
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Marco web server listening on 0.0.0.0:${PORT}`);
  
  // Health monitor: check all agents every 5 minutes
  setInterval(() => {
    runHealthMonitor().catch(err => console.error('[health-monitor]', err));
  }, 5 * 60 * 1000);
  console.log('[health-monitor] Started (5min interval)');
  
  // Health history cleanup: remove rows older than 30 days daily
  setInterval(() => {
    cleanupHealthHistory().catch(console.error);
  }, 24 * 60 * 60 * 1000);
  console.log('[health-history-cleanup] Started (24h interval)');
});
