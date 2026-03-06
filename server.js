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

app.get('/robots.txt', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(`User-agent: *
Allow: /
Disallow: /api/
Disallow: /auth/
Disallow: /webhooks/
Sitemap: https://agentx.market/sitemap.xml`);
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
    const agents = db.prepare('SELECT * FROM agents ORDER BY featured DESC, featured_until DESC, created_at DESC').all();
    const formatted = agents.map(a => {
      const uptime = calculateUptime(a.id);
      const operator = db.get('SELECT verified, verification_method, verified_at FROM operators WHERE id = ?', [a.operator_id]);
      return {
        ...a,
        capabilities: a.capabilities ? JSON.parse(a.capabilities) : [],
        healthStatus: a.health_status || 'offline',
        lastHealthCheck: a.last_health_check,
        responseTimeMs: a.response_time_ms,
        uptimePercent: uptime.uptimePercent,
        featured: a.featured || 0,
        featured_until: a.featured_until,
        verified: operator?.verified || 0,
        verification_method: operator?.verification_method || null,
        verified_at: operator?.verified_at || null,
        verifiedBadge: operator?.verified === 1
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

app.get('/api/agents/:id', (req, res) => {
  try {
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    const uptime = calculateUptime(agent.id);
    const operator = db.get('SELECT verified, verification_method, verified_at FROM operators WHERE id = ?', [agent.operator_id]);
    agent.capabilities = agent.capabilities ? JSON.parse(agent.capabilities) : [];
    agent.healthStatus = agent.health_status || 'offline';
    agent.lastHealthCheck = agent.last_health_check;
    agent.responseTimeMs = agent.response_time_ms;
    agent.uptimePercent = uptime.uptimePercent;
    agent.verified = operator?.verified || 0;
    agent.verification_method = operator?.verification_method || null;
    agent.verified_at = operator?.verified_at || null;
    agent.verifiedBadge = operator?.verified === 1;
    res.json(agent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Agent schema endpoint - returns agent's capabilities and endpoint
app.get('/api/agents/:id/schema', authenticatedLimiter, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const agent = db.get('SELECT capabilities, endpoint_url FROM agents WHERE id=?', [id]);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    res.json({ 
      capabilities: agent.capabilities ? JSON.parse(agent.capabilities) : [], 
      endpoint: agent.endpoint_url 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Agent stats endpoint - returns usage statistics for analytics dashboard
app.get('/api/agents/:id/stats', authenticatedLimiter, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const agent = db.get('SELECT id FROM agents WHERE id=?', [id]);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    
    const stats = db.prepare(
      'SELECT date(created_at) as day, SUM(tasks_completed) as tasks, AVG(response_time_ms) as avg_ms, SUM(errors) as errors FROM agent_usage WHERE agent_id=? GROUP BY day ORDER BY day DESC LIMIT 30'
    ).all(String(id));
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Agent status badge
app.get('/api/agents/:id/badge', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const agent = db.get('SELECT id, name, health_check_passed_at FROM agents WHERE id=?', [id]);
    if (!agent) return res.status(404).send('Not found');
    
    const now = new Date();
    const lastHealth = agent.health_check_passed_at ? new Date(agent.health_check_passed_at) : null;
    const isOnline = lastHealth && (now - lastHealth) <= 5 * 60 * 1000;
    const status = isOnline ? 'online' : 'offline';
    const color = isOnline ? '#4c1' : '#e05d44';
    
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="20" viewBox="0 0 200 20">
      <rect width="200" height="20" rx="3" fill="${color}"/>
      <text x="10" y="14" font-family="Arial" font-size="12" fill="white" text-anchor="start">${agent.name || 'Agent'}</text>
      <text x="180" y="14" font-family="Arial" font-size="12" fill="white" text-anchor="end">${status}</text>
    </svg>`;
    
    res.set('Content-Type', 'image/svg+xml');
    res.send(svg);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Agent status embed widget
app.get('/api/agents/:id/embed', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const agent = db.get('SELECT id, name, health_check_passed_at, created_at FROM agents WHERE id=?', [id]);
    if (!agent) return res.status(404).send('Not found');
    
    const now = new Date();
    const lastHealth = agent.health_check_passed_at ? new Date(agent.health_check_passed_at) : null;
    const isOnline = lastHealth && (now - lastHealth) <= 5 * 60 * 1000;
    const statusColor = isOnline ? '#4c1' : '#e05d44';
    
    const createdAt = agent.created_at ? new Date(agent.created_at) : now;
    const uptimeMs = lastHealth ? now - createdAt : 0;
    const totalMs = now - createdAt;
    const uptimePercent = totalMs > 0 ? Math.round((uptimeMs / totalMs) * 100) : 0;
    
    const html = `<div style="font-family: Arial, sans-serif; background: #1e1e1e; color: #e0e0e0; padding: 12px; border-radius: 6px; border: 1px solid #333;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <div style="width: 10px; height: 10px; border-radius: 50%; background: ${statusColor};"></div>
        <strong>${agent.name || 'Agent'}</strong>
      </div>
      <div style="margin-top: 4px; font-size: 12px; color: #aaa;">
        Uptime: ${uptimePercent}%
      </div>
    </div>`;
    
    res.set('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Agent invoke endpoint - forwards method+params to agent's endpoint with HMAC-SHA256 signature
app.post('/api/agents/:id/invoke', authMiddleware, authenticatedLimiter, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { method, params } = req.body;
    
    if (!method) {
      return res.status(400).json({ error: 'method is required' });
    }
    
    const agent = db.get('SELECT endpoint_url, api_keys.key_hash FROM agents JOIN api_keys ON agents.id = api_keys.agent_id WHERE agents.id=? AND agents.status="active"', [id]);
    if (!agent) return res.status(404).json({ error: 'Agent not found or inactive' });
    
    const payload = JSON.stringify({ method, params });
    const crypto = require('crypto');
    const signature = crypto.createHmac('sha256', agent.key_hash).update(payload).digest('hex');
    
    const resp = await fetch(agent.endpoint_url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-AgentX-Signature': signature
      },
      body: payload
    });
    
    const result = await resp.json();
    res.json(result);
  } catch (err) {
    console.error(`[invoke] Error: ${err.message}`);
    res.status(500).json({ error: 'Invoke failed', details: err.message });
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
      'UPDATE agents SET status = ?, health_check_passed_at = ?, updated_at = ?, featured = 1, featured_until = ? WHERE id = ?',
      ['active', now, now, now + (30 * 24 * 60 * 60 * 1000), agentId]
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

// Submit agent endpoint
app.post('/api/submit-agent', formLimiter, async (req, res) => {
  const { agentName, agentUrl, healthUrl, description, category, pricing, logoUrl, contactEmail } = req.body;
  
  // Required field validation
  if (!agentName || !agentUrl || !description || !category || !pricing || !contactEmail) {
    return res.status(400).json({ error: 'All required fields must be provided' });
  }
  
  // Input validation
  if (typeof agentName !== 'string' || agentName.length > 100) {
    return res.status(400).json({ error: 'Agent name must be under 100 characters' });
  }
  if (typeof agentUrl !== 'string' || !/^https?:\/\//.test(agentUrl)) {
    return res.status(400).json({ error: 'Valid agent URL (starting with http:// or https://) is required' });
  }
  if (typeof description !== 'string' || description.length > 2000) {
    return res.status(400).json({ error: 'Description must be under 2000 characters' });
  }
  if (!['free', 'paid', 'freemium'].includes(pricing)) {
    return res.status(400).json({ error: 'Invalid pricing model' });
  }
  if (typeof contactEmail !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }
  if (healthUrl && (!/^https?:\/\//.test(healthUrl) || healthUrl.length > 500)) {
    return res.status(400).json({ error: 'Invalid health check URL' });
  }
  if (logoUrl && (!/^https?:\/\//.test(logoUrl) || logoUrl.length > 500)) {
    return res.status(400).json({ error: 'Invalid logo URL' });
  }
  
  const now = Date.now();
  const slug = agentName.toLowerCase().replace(/ /g, '-').replace(/[^a-z0-9-]/g, '');
  
  // Check if agent already exists
  const existing = db.get('SELECT id FROM agents WHERE LOWER(REPLACE(name, " ", "-")) = ?', [slug]);
  if (existing) {
    return res.status(400).json({ error: 'An agent with this name already exists' });
  }
  
  // Determine approval status based on health check
  let status = 'pending';
  let healthCheckPassedAt = null;
  
  if (healthUrl) {
    try {
      const response = await fetch(healthUrl, { timeout: 5000 });
      if (response.ok) {
        status = 'approved';
        healthCheckPassedAt = now;
        console.log(`[submit-agent] Auto-approved ${agentName} - health check passed`);
      } else {
        console.log(`[submit-agent] ${agentName} health check failed (${response.status}), pending review`);
      }
    } catch (err) {
      console.log(`[submit-agent] ${agentName} health check error: ${err.message}, pending review`);
    }
  }
  
  // Insert into agents table
  try {
    db.run(
      `INSERT INTO agents (operator_id, name, description, endpoint_url, pricing, status, health_check_passed_at, health_endpoint_url, created_at, updated_at, wallet_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        null, // operator_id is null for public submissions
        agentName,
        description,
        agentUrl,
        pricing,
        status,
        healthCheckPassedAt,
        healthUrl || null,
        now,
        now,
        crypto.randomUUID()
      ]
    );
    
    // Get the inserted agent ID
    const agentId = db.get('SELECT last_insert_rowid() as id')?.id;
    
    // Add category if provided
    if (category) {
      const categoryRow = db.get('SELECT id FROM categories WHERE slug = ?', [category]);
      if (categoryRow) {
        db.run('INSERT OR IGNORE INTO agent_categories (agent_id, category_id) VALUES (?, ?)', [agentId, categoryRow.id]);
      }
    }
    
    // Send confirmation email
    try {
      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Agent Submission Confirmation</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">🎉 Agent Submission Received!</h1>
          </div>
          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
            <p style="font-size: 16px; margin-bottom: 20px;">Hi there,</p>
            <p style="font-size: 16px; margin-bottom: 20px;">Thank you for submitting <strong>${agentName}</strong> to <strong>AgentX.Market</strong>!</p>
            
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #6366f1;">
              <h3 style="color: #6366f1; margin-top: 0;">Submission Details:</h3>
              <p><strong>Agent Name:</strong> ${agentName}</p>
              <p><strong>Category:</strong> ${category}</p>
              <p><strong>Pricing:</strong> ${pricing}</p>
              <p><strong>Status:</strong> <span style="background: ${status === 'approved' ? '#22c55e' : '#f59e0b'}; color: white; padding: 4px 12px; border-radius: 4px; font-size: 14px;">${status.toUpperCase()}</span></p>
            </div>
            
            ${status === 'approved' 
              ? `<p style="font-size: 16px; margin-bottom: 20px; color: #22c55e;"><strong>✅ Auto-approved!</strong> Your agent has been automatically approved and will be live on AgentX.Market shortly.</p>`
              : `<p style="font-size: 16px; margin-bottom: 20px; color: #f59e0b;"><strong>⏳ Pending Review:</strong> Our team will review your submission within 24 hours and notify you once it's approved.</p>`
            }
            
            <p style="font-size: 16px; margin-bottom: 20px;">You can track your submission at: <a href="https://agentx.market/browse" style="color: #6366f1; text-decoration: none;">agentx.market/browse</a></p>
            
            <div style="background: #e0e7ff; padding: 15px; border-radius: 8px; margin: 20px 0; font-size: 14px;">
              <strong>💡 Pro Tip:</strong> Once approved, you can claim your agent and access advanced features like analytics, custom domains, and more!
            </div>
            
            <p style="font-size: 16px; margin-bottom: 20px;">Thanks for being part of the AgentX community!</p>
            
            <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
              Best regards,<br>
              <strong>The AgentX.Market Team</strong><br>
              <a href="https://agentx.market" style="color: #6366f1; text-decoration: none;">agentx.market</a>
            </p>
          </div>
        </body>
        </html>
      `;
      
      await email.sendEmail({
        to: contactEmail,
        subject: '🎉 AgentX.Market - Your Agent Submission Was Received!',
        html: emailHtml
      });
      
      console.log(`[submit-agent] Confirmation email sent to ${contactEmail}`);
    } catch (emailErr) {
      console.error(`[submit-agent] Email failed:`, emailErr.message);
    }
    
    // Notify Paul via Telegram
    const statusEmoji = status === 'approved' ? '✅' : '⏳';
    const text = `${statusEmoji} *New Agent Submission*\n\n` +
      `*Name:* ${agentName}\n` +
      `*URL:* ${agentUrl}\n` +
      `*Category:* ${category}\n` +
      `*Pricing:* ${pricing}\n` +
      `*Status:* ${status.toUpperCase()}\n` +
      `*Contact:* ${contactEmail}`;
    
    const payload = JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'Markdown'
    });
    
    const tgReq = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, () => {});
    
    tgReq.on('error', (err) => console.error('[submit-agent] Telegram notify failed:', err.message));
    tgReq.write(payload);
    tgReq.end();
    
    res.json({ 
      status: 'ok', 
      message: 'Agent submitted successfully',
      agentId: agentId,
      status: status
    });
  } catch (err) {
    console.error('[submit-agent] Database error:', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Create Stripe payment link (for agents to generate on-demand)
app.post('/api/create-payment-link', authLimiter, async (req, res) => {
  const { plan, customer_email } = req.body;
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(503).json({ error: 'Stripe not configured' });
  }

  // Map plan to Stripe price_id (use env vars or test prices)
  const priceIds = {
    pro: process.env.STRIPE_PRO_PRICE_ID || 'price_test_pro_123', // Replace with actual test price ID
  };
  const price_id = priceIds[plan];
  
  if (!price_id) {
    return res.status(400).json({ error: 'Invalid plan' });
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
      metadata: { plan },
    });

    console.log(`[stripe] Payment link created for ${customer_email || 'anonymous'} - plan: ${plan}`);
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
  const nlpSearch = require('./scripts/nlp-search');
  
  let query = 'SELECT a.id, a.name, a.description, a.health_check_passed_at, a.health_endpoint_url, a.created_at, a.community_listing, a.claim_url, a.endpoint_url, a.operator_id, a.featured, a.featured_until FROM agents a WHERE 1=1';
  const params = [];

  if (search) {
    // Use natural language search with keyword extraction and fuzzy matching
    const keywords = nlpSearch.extractKeywords(search);
    
    if (keywords.length > 0) {
      // Build OR conditions for each keyword across name, description, and categories
      const keywordConditions = [];
      keywords.forEach(keyword => {
        const lowerKeyword = keyword.toLowerCase();
        keywordConditions.push(`(LOWER(a.name) LIKE ? OR LOWER(a.description) LIKE ?)`);
        params.push(`%${lowerKeyword}%`, `%${lowerKeyword}%`);
      });
      
      // Combine with OR for fuzzy matching, then we'll rank by relevance in JS
      query += ' AND (' + keywordConditions.join(' OR ') + ')';
    } else {
      // Fallback to simple LIKE if no keywords extracted
      query += ' AND (LOWER(a.name) LIKE ? OR LOWER(a.description) LIKE ?)';
      params.push(`%${search.toLowerCase()}%`, `%${search.toLowerCase()}%`);
    }
  }

  if (category) {
    query += ' AND a.id IN (SELECT agent_id FROM agent_categories WHERE category_id = (SELECT id FROM categories WHERE name = ?))';
    params.push(category);
  }

  // Sorting - featured agents first
  const validSorts = {
    'newest': 'a.created_at DESC',
    'popular': 'a.created_at DESC',
    'uptime': 'a.health_check_passed_at DESC',
    'name': 'a.name ASC'
  };
  const sortClause = validSorts[sort] || 'a.created_at DESC';
  query += ` ORDER BY a.featured DESC, a.featured_until DESC, ${sortClause}`;

  const agents = db.all(query, params);
  
  // Get categories for each agent
  const agentIds = agents.map(a => a.id);
  const agentCategories = {};
  if (agentIds.length > 0) {
    const categoryQuery = 'SELECT ac.agent_id, c.name as category FROM agent_categories ac JOIN categories c ON ac.category_id = c.id WHERE ac.agent_id IN (' + agentIds.map(() => '?').join(',') + ')';
    const categoryParams = agentIds;
    const categories = db.all(categoryQuery, categoryParams);
    categories.forEach(row => {
      if (!agentCategories[row.agent_id]) {
        agentCategories[row.agent_id] = [];
      }
      agentCategories[row.agent_id].push(row.category);
    });
  }
  
  // Get review stats for each agent
  const reviewStats = {};
  if (agentIds.length > 0) {
    const reviewQuery = 'SELECT agent_id, AVG(rating) as avg_rating, COUNT(*) as review_count FROM reviews WHERE agent_id IN (' + agentIds.map(() => '?').join(',') + ') GROUP BY agent_id';
    const reviews = db.all(reviewQuery, agentIds);
    reviews.forEach(row => {
      reviewStats[row.agent_id] = { avg_rating: row.avg_rating, review_count: row.review_count };
    });
  }
  
  // Format agents with calculated fields
  let formatted = agents.map(a => {
    const operator = db.get('SELECT verified, verification_method, verified_at FROM operators WHERE id = ?', [a.operator_id]);
    return {
      id: a.id,
      name: a.name,
      description: a.description,
      categories: agentCategories[a.id] || [],
      uptime_percent: 99.9,  // Default uptime for seeded agents
      last_health_check: a.health_check_passed_at,
      verified: operator?.verified || 0,
      verification_method: operator?.verification_method || null,
      verified_at: operator?.verified_at || null,
      verifiedBadge: operator?.verified === 1,
    slug: a.name.toLowerCase().replace(/ /g, '-'),
    health_endpoint_url: a.health_endpoint_url,
    endpoint_url: a.endpoint_url,
    community_listing: a.community_listing || 0,
    claim_url: a.claim_url,
    operator_id: a.operator_id,
    rating: reviewStats[a.id]?.avg_rating ? Math.round(reviewStats[a.id].avg_rating * 10) / 10 : null,
    review_count: reviewStats[a.id]?.review_count || 0,
    featured: a.featured || 0,
    featured_until: a.featured_until
    };
  });
  
  // Apply natural language ranking if search query exists
  if (search) {
    const keywords = nlpSearch.extractKeywords(search);
    if (keywords.length > 0) {
      formatted = nlpSearch.rankAgentsByRelevance(formatted, keywords);
      // Sort by relevance score first, then by featured/created
      formatted.sort((a, b) => {
        if (b.relevanceScore !== a.relevanceScore) {
          return b.relevanceScore - a.relevanceScore;
        }
        // Fallback to original sort if relevance scores are equal
        if (b.featured !== a.featured) return b.featured - a.featured;
        return (b.created_at || 0) - (a.created_at || 0);
      });
    }
  }
  
  res.json({ agents: formatted, total: formatted.length });
});

// Get distinct categories for filter dropdown
app.get('/api/categories', (req, res) => {
  const categories = db.prepare('SELECT name FROM categories ORDER BY name').all();
  const categoryNames = categories.map(c => c.name);
  res.json(categoryNames);
});

// Get category counts for browse page
app.get('/api/category-counts', (req, res) => {
  const counts = db.prepare('SELECT c.name as category, COUNT(ac.agent_id) as count FROM categories c LEFT JOIN agent_categories ac ON c.id = ac.category_id GROUP BY c.id ORDER BY c.name').all();
  res.json(counts);
});

// Browse page route
app.get('/browse', (req, res) => {
  const agentCount = db.get('SELECT COUNT(*) as count FROM agents').count;
  res.render('browse', { title: 'Browse Agents', agentCount });
});

// Submit agent page
app.get('/submit', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'submit.html'));
});

// Changelog page route
app.get('/changelog', (req, res) => {
  const backlogDb = new (require('better-sqlite3'))('/Users/marco/marco_web/backlog.db');
  const features = backlogDb.prepare('SELECT id, title, completed_at, built_by FROM features WHERE status = ? ORDER BY completed_at DESC LIMIT 20').all('shipped');
  res.render('changelog', { title: 'Changelog', features });
});

app.get('/login', (req, res) => {
  if (req.operatorId) return res.redirect('/my-agents');
  res.render('login');
});

app.get('/status', (req, res) => {
  const agents = db.all('SELECT id, name, status, health_check_passed_at FROM agents ORDER BY name');
  const now = Date.now();
  const agentsWithHealth = agents.map(a => ({
    ...a,
    healthy: a.health_check_passed_at && (now - a.health_check_passed_at) < 300000,
    lastCheck: a.health_check_passed_at ? Math.round((now - a.health_check_passed_at) / 60000) : null
  }));
  const allHealthy = agentsWithHealth.every(a => a.healthy);
  res.render('status', { agents: agentsWithHealth, allHealthy });
});

app.get('/my-agents', (req, res) => {
  if (!req.operatorId) return res.redirect('/auth/github');
  const agents = db.all('SELECT * FROM agents WHERE operator_id = ?', [req.operatorId]);
  res.render('dashboard', { agents, operator: { id: req.operatorId } });
});

// Dashboard API keys management
app.get('/dashboard/keys', (req, res) => {
  if (!req.operatorId) return res.redirect('/auth/github');
  
  const agents = db.all('SELECT id, name FROM agents WHERE operator_id = ?', [req.operatorId]);
  res.render('dashboard-keys', { agents, operator: { id: req.operatorId } });
});

// Dashboard billing - redirect to Stripe Customer Portal
app.get('/dashboard/billing', (req, res) => {
  if (!req.operatorId) return res.redirect('/auth/github');
  
  try {
    const Stripe = require('stripe');
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    
    // Get operator email from database
    const operator = db.get('SELECT email FROM operators WHERE id = ?', [req.operatorId]);
    if (!operator) {
      return res.status(404).json({ error: 'Operator not found' });
    }
    
    // Get Stripe customer ID (stored in stripe_customers table)
    const customer = db.get('SELECT id FROM stripe_customers WHERE operator_id = ?', [req.operatorId]);
    if (!customer) {
      return res.status(404).json({ error: 'No Stripe customer record found' });
    }
    
    // Create billing portal session
    const session = stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: 'https://agentx.market/dashboard',
    });
    
    res.redirect(session.url);
  } catch (err) {
    console.error('[billing-portal] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// API: Get analytics for operator's agents
app.get('/api/my-agents/analytics', (req, res) => {
  if (!req.operatorId) return res.status(401).json({ error: 'Unauthorized' });
  
  const agents = db.all('SELECT id FROM agents WHERE operator_id = ?', [req.operatorId]);
  const agentIds = agents.map(a => a.id);
  
  if (agentIds.length === 0) {
    return res.json({ analytics: [] });
  }
  
  const placeholders = agentIds.map(() => '?').join(',');
  
  const analytics = db.prepare(`
    SELECT 
      agent_id,
      COUNT(*) as total_views,
      SUM(CASE WHEN created_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) as views_7d,
      SUM(CASE WHEN created_at >= datetime('now', '-30 days') THEN 1 ELSE 0 END) as views_30d
    FROM analytics_events
    WHERE agent_id IN (${placeholders}) AND event_type = 'page_view'
    GROUP BY agent_id
  `).all(...agentIds);
  
  res.json({ analytics });
});

app.get('/docs', (req, res) => res.render('docs'));

// Sitemap route
app.get('/sitemap.xml', async (req, res) => {
  const now = new Date().toISOString().split('T')[0];
  const agents = db.all('SELECT id, name FROM agents');
  
  const agentUrls = agents.map(agent => {
    const slug = agent.name.toLowerCase().replace(/ /g, '-');
    return `    <url>
      <loc>https://agentx.market/agents/${slug}</loc>
      <changefreq>weekly</changefreq>
      <priority>0.8</priority>
      <lastmod>${now}</lastmod>
    </url>`;
  }).join('\n');
  
  res.set('Content-Type', 'application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://agentx.market/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
    <lastmod>${now}</lastmod>
  </url>
  <url>
    <loc>https://agentx.market/browse</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
    <lastmod>${now}</lastmod>
  </url>
  <url>
    <loc>https://agentx.market/pricing</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
    <lastmod>${now}</lastmod>
  </url>
  <url>
    <loc>https://agentx.market/features</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
    <lastmod>${now}</lastmod>
  </url>
  <url>
    <loc>https://agentx.market/about</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
    <lastmod>${now}</lastmod>
  </url>
  <url>
    <loc>https://agentx.market/contact</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
    <lastmod>${now}</lastmod>
  </url>
  <url>
    <loc>https://agentx.market/login</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
    <lastmod>${now}</lastmod>
  </url>
  <url>
    <loc>https://agentx.market/docs</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
    <lastmod>${now}</lastmod>
  </url>
  <url>
    <loc>https://agentx.market/status</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
    <lastmod>${now}</lastmod>
  </url>
  <url>
    <loc>https://agentx.market/register</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
    <lastmod>${now}</lastmod>
  </url>
  <url>
    <loc>https://agentx.market/blog</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
    <lastmod>${now}</lastmod>
  </url>
${agentUrls}
</urlset>`);
});

// Agent registration page
app.get('/register', (req, res) => {
  res.render('register', { title: 'Register Your Agent' });
});

// Comparison page route (MUST be before /agents/:slug to avoid route conflict)
app.get('/compare/:slug-a-vs-:slug-b', (req, res) => {
  const { 'slug-a': slugA, 'slug-b': slugB } = req.params;
  const agentQueries = require('./lib/agent-queries');
  
  const agentA = agentQueries.getAgentBySlug(slugA);
  const agentB = agentQueries.getAgentBySlug(slugB);
  
  if (!agentA || !agentB) {
    return res.status(404).render('agent-not-found', { 
      message: 'One or both agents not found' 
    });
  }
  
  // Get categories for both agents
  const categoriesA = db.prepare('SELECT c.name FROM agent_categories ac JOIN categories c ON ac.category_id = c.id WHERE ac.agent_id = ?').all(agentA.id);
  const categoriesB = db.prepare('SELECT c.name FROM agent_categories ac JOIN categories c ON ac.category_id = c.id WHERE ac.agent_id = ?').all(agentB.id);
  
  // Get review stats
  const reviewsA = db.prepare('SELECT AVG(rating) as avg_rating, COUNT(*) as review_count FROM reviews WHERE agent_id = ?').get(agentA.id);
  const reviewsB = db.prepare('SELECT AVG(rating) as avg_rating, COUNT(*) as review_count FROM reviews WHERE agent_id = ?').get(agentB.id);
  
  // Calculate common categories
  const commonCategories = categoriesA.filter(catA => 
    categoriesB.some(catB => catA.name === catB.name)
  ).map(c => c.name);
  
  res.render('comparison', {
    title: `${agentA.name} vs ${agentB.name} — Comparison`,
    agentA,
    agentB,
    commonCategories,
    reviewsA: reviewsA || { avg_rating: null, review_count: 0 },
    reviewsB: reviewsB || { avg_rating: null, review_count: 0 }
  });
});

// Agent detail page route
app.get('/agents/:slug', (req, res) => {
  const { slug } = req.params;
  const agentQueries = require('./lib/agent-queries');
  
  const agent = agentQueries.getAgentBySlug(slug);
  
  if (!agent) {
    return res.status(404).render('404', { message: 'Agent not found' });
  }
  
  // Track page view analytics
  if (agent.id) {
    const ip = req.ip || req.connection.remoteAddress;
    const ipHash = require('crypto').createHash('sha256').update(ip).digest('hex').substring(0, 16);
    db.prepare('INSERT INTO analytics_events (agent_id, event_type, referrer, ip_hash) VALUES (?, ?, ?, ?)').run(
      agent.id,
      'page_view',
      req.get('Referrer') || null,
      ipHash
    );
  }
  
  const uptimeTrend = agentQueries.getAgentUptimeTrend(agent.id);
  
  // Get reviews for this agent (sorted newest first)
  const reviews = db.prepare('SELECT r.*, o.name as user_name FROM reviews r LEFT JOIN operators o ON r.user_id = o.id WHERE r.agent_id = ? ORDER BY r.created_at DESC').all(agent.id);
  
  // Get similar agents: same category, exclude current agent, sorted by rating DESC, then uptime
  const similarAgents = [];
  const categories = db.prepare('SELECT c.id, c.name FROM agent_categories ac JOIN categories c ON ac.category_id = c.id WHERE ac.agent_id = ?').all(agent.id);
  if (categories.length > 0) {
    const categoryIds = categories.map(c => c.id);
    const placeholders = categoryIds.map(() => '?').join(',');
    const query = `
      SELECT a.id, a.name, a.description, a.pricing, a.uptime_percent, a.rating,
             LOWER(REPLACE(a.name, ' ', '-')) as slug
      FROM agents a
      JOIN agent_categories ac ON a.id = ac.agent_id
      WHERE ac.category_id IN (${placeholders})
      AND a.id != ?
      ORDER BY a.rating DESC, a.uptime_percent DESC
      LIMIT 5
    `;
    const params = [...categoryIds, agent.id];
    similarAgents.push(...db.all(query, params));
  }
  
  res.render('agent-detail', {
    agent,
    uptimeTrend,
    uptime7d: agent.uptime_percent ? Math.round(agent.uptime_percent * 100) / 100 : 'N/A',
    reviews,
    similarAgents,
    isLoggedIn: !!req.operatorId
  });
});

// Comparison page route
app.get('/compare/:slug-a-vs-:slug-b', (req, res) => {
  const { 'slug-a': slugA, 'slug-b': slugB } = req.params;
  const agentQueries = require('./lib/agent-queries');
  
  const agentA = agentQueries.getAgentBySlug(slugA);
  const agentB = agentQueries.getAgentBySlug(slugB);
  
  if (!agentA || !agentB) {
    return res.status(404).render('agent-not-found', { 
      message: 'One or both agents not found' 
    });
  }
  
  // Get categories for both agents
  const categoriesA = db.prepare('SELECT c.name FROM agent_categories ac JOIN categories c ON ac.category_id = c.id WHERE ac.agent_id = ?').all(agentA.id);
  const categoriesB = db.prepare('SELECT c.name FROM agent_categories ac JOIN categories c ON ac.category_id = c.id WHERE ac.agent_id = ?').all(agentB.id);
  
  // Get review stats
  const reviewsA = db.prepare('SELECT AVG(rating) as avg_rating, COUNT(*) as review_count FROM reviews WHERE agent_id = ?').get(agentA.id);
  const reviewsB = db.prepare('SELECT AVG(rating) as avg_rating, COUNT(*) as review_count FROM reviews WHERE agent_id = ?').get(agentB.id);
  
  // Calculate common categories
  const commonCategories = categoriesA.filter(catA => 
    categoriesB.some(catB => catA.name === catB.name)
  ).map(c => c.name);
  
  res.render('comparison', {
    title: `${agentA.name} vs ${agentB.name} — Comparison`,
    agentA,
    agentB,
    commonCategories,
    reviewsA: reviewsA || { avg_rating: null, review_count: 0 },
    reviewsB: reviewsB || { avg_rating: null, review_count: 0 }
  });
});

app.get('/agents/:slug/docs', (req, res) => {
  const { slug } = req.params;
  const agentQueries = require('./lib/agent-queries');
  
  const agent = agentQueries.getAgentBySlug(slug);
  
  if (!agent) {
    return res.status(404).render('404', { message: 'Agent not found' });
  }
  
  res.render('agent-docs', { agent });
});

// Programmatic category landing pages: /best/:use-case
app.get('/best/:useCase', (req, res) => {
  const { useCase } = req.params;
  const agentQueries = require('./lib/agent-queries');
  
  // Map use-case slugs to category names (matches actual categories table)
  const useCaseToCategory = {
    'qa-testing': 'QA & Testing',
    'security': 'Security',
    'content': 'Content',
    'data': 'Data',
    'operations': 'Operations'
  };
  
  const categoryName = useCaseToCategory[useCase];
  
  if (!categoryName) {
    return res.status(404).render('404', { message: 'Use case not found' });
  }
  
  // Get agents in this category
  const category = db.prepare('SELECT * FROM categories WHERE slug = ? OR name = ?').get(useCase, categoryName);
  
  if (!category) {
    return res.status(404).render('404', { message: 'Use case not found' });
  }
  
  const agents = db.prepare(`
    SELECT a.*, 
           LOWER(REPLACE(a.name, ' ', '-')) as slug,
           c.name as category_name
    FROM agents a
    JOIN agent_categories ac ON a.id = ac.agent_id
    JOIN categories c ON ac.category_id = c.id
    WHERE c.slug = ? OR c.name = ?
    AND a.status = 'active'
    ORDER BY a.rating DESC, a.uptime_percent DESC
  `).all(useCase, categoryName);
  
  if (agents.length === 0) {
    return res.status(404).render('404', { message: 'No agents found for this use case' });
  }
  
  // Get top 5 for comparison table
  const topAgents = agents.slice(0, 5);
  
  // Generate FAQ based on use case
  const faqs = generateUseCaseFAQ(useCase, categoryName);
  
  // Generate JSON-LD SoftwareApplication schema for each agent
  const agentSchemas = agents.map(agent => ({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": agent.name,
    "applicationCategory": categoryName,
    "description": agent.description,
    "url": `https://agentx.market/agents/${agent.slug}`,
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": agent.rating || "0",
      "ratingCount": agent.review_count || "0"
    },
    "offers": {
      "@type": "Offer",
      "price": agent.pricing || "Contact for pricing",
      "priceCurrency": "USD"
    }
  }));
  
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": `Best ${categoryName} AI Agents in 2024`,
    "description": `Discover the top ${categoryName.toLowerCase()} AI agents on AgentX.Market. Compare features, pricing, and ratings to find the perfect AI solution for your needs.`,
    "mainEntity": {
      "@type": "ItemList",
      "itemListElement": topAgents.map((agent, index) => ({
        "@type": "ListItem",
        "position": index + 1,
        "item": {
          "@type": "SoftwareApplication",
          "name": agent.name,
          "applicationCategory": categoryName,
          "aggregateRating": {
            "@type": "AggregateRating",
            "ratingValue": agent.rating || "0",
            "ratingCount": agent.review_count || "0"
          },
          "description": agent.description,
          "url": `https://agentx.market/best/${useCase}`
        }
      }))
    }
  };
  
  res.render('best-use-case', {
    categoryName,
    useCase,
    agents,
    topAgents,
    faqs,
    schema: JSON.stringify(schema),
    agentSchemas: agentSchemas.map(s => JSON.stringify(s))
  });
});

function generateUseCaseFAQ(useCase, categoryName) {
  const faqMap = {
    'qa-testing': [
      { q: "What AI agents help with QA testing?", a: "QA testing AI agents automate test case generation, execute tests, detect bugs, and provide quality reports. Top agents integrate with CI/CD pipelines and support multiple testing frameworks." },
      { q: "How do AI agents improve QA workflows?", a: "AI agents reduce testing time by 50-70% by automating repetitive test execution, generating test cases from requirements, and identifying edge cases humans might miss." },
      { q: "Can AI agents work with existing test frameworks?", a: "Yes, most QA AI agents on AgentX.Market integrate with Selenium, Cypress, Jest, and other popular testing frameworks. They can generate tests in your preferred language and framework." }
    ],
    'security': [
      { q: "What AI agents help with security?", a: "Security AI agents monitor for threats, analyze vulnerabilities, detect anomalies, and automate incident response. Top agents integrate with SIEM tools and provide real-time threat intelligence." },
      { q: "How do AI agents improve security posture?", a: "AI agents detect threats 10x faster than manual monitoring, automate patch management, and provide 24/7 security oversight. They reduce false positives and prioritize critical vulnerabilities." },
      { q: "Can AI agents integrate with existing security tools?", a: "Yes, security AI agents integrate with firewalls, SIEM platforms, vulnerability scanners, and cloud security tools. They provide unified visibility across your security stack." }
    ],
    'content': [
      { q: "What AI agents help with content creation?", a: "Content AI agents generate blog posts, articles, social media posts, and marketing copy. Top agents support multiple formats, maintain brand voice, and optimize for SEO." },
      { q: "How much time can AI save on content creation?", a: "Content teams report 70-90% time savings with AI agents. They automate drafting, editing, and optimization, allowing creators to focus on strategy and creativity." },
      { q: "Can AI agents maintain brand voice?", a: "Yes, AI agents can be trained on your brand guidelines, past content, and style preferences to maintain consistent voice and tone across all generated content." }
    ],
    'data': [
      { q: "What AI agents help with data analysis?", a: "Data AI agents process datasets, generate insights, create visualizations, and automate reporting. Top agents support SQL, Python, and integrate with popular data platforms." },
      { q: "How do AI agents improve data analysis workflows?", a: "AI agents automate data cleaning, pattern detection, and insight generation. They reduce analysis time by 60-80% and help non-technical users extract value from their data." },
      { q: "Can AI agents handle large datasets?", a: "Most data AI agents on AgentX.Market can process datasets from thousands to millions of rows. Enterprise solutions handle even larger datasets with distributed processing." }
    ],
    'operations': [
      { q: "What AI agents help with operations?", a: "Operations AI agents automate monitoring, incident response, resource provisioning, and performance optimization. Top agents integrate with DevOps tools and provide real-time system insights." },
      { q: "How do AI agents improve operational efficiency?", a: "AI agents reduce MTTR by 50% through automated incident detection and response, predict failures before they occur, and optimize resource allocation for cost savings." },
      { q: "Can AI agents integrate with existing DevOps tools?", a: "Yes, operations AI agents integrate with Kubernetes, Docker, AWS, Azure, monitoring tools, and CI/CD pipelines. They provide unified visibility across your infrastructure." }
    ]
  };
  
  return faqMap[useCase] || [
    { q: `What is the best AI agent for ${categoryName.toLowerCase()}?`, a: `The best ${categoryName.toLowerCase()} AI agent depends on your specific requirements. Top options on AgentX.Market offer features like automation, analytics, integrations, and customizable workflows.` },
    { q: `How much do ${categoryName.toLowerCase()} AI agents cost?`, a: `${categoryName.toLowerCase()} AI agents range from free tiers to enterprise pricing. Most offer flexible plans based on usage, features, and team size.` },
    { q: `Can AI agents integrate with my existing tools?`, a: `Most ${categoryName.toLowerCase()} AI agents on AgentX.Market integrate with popular tools via APIs, webhooks, or native connectors. Check individual agent documentation for specific integrations.` }
  ];
}

// Alternatives page route
app.get('/alternatives/:slug', (req, res) => {
  const { slug } = req.params;
  const agentQueries = require('./lib/agent-queries');
  
  const agent = agentQueries.getAgentBySlug(slug);
  
  if (!agent) {
    return res.status(404).render('404', { message: 'Agent not found' });
  }
  
  // Get categories for this agent
  const categories = db.prepare('SELECT c.id, c.name FROM agent_categories ac JOIN categories c ON ac.category_id = c.id WHERE ac.agent_id = ?').all(agent.id);
  
  // Find alternatives: agents in the same categories, excluding the current agent
  const alternatives = [];
  if (categories.length > 0) {
    const categoryIds = categories.map(c => c.id);
    const placeholders = categoryIds.map(() => '?').join(',');
    const query = `
      SELECT a.id, a.name, a.description, a.pricing, a.health_check_passed_at, a.rating,
             LOWER(REPLACE(a.name, ' ', '-')) as slug
      FROM agents a
      JOIN agent_categories ac ON a.id = ac.agent_id
      WHERE ac.category_id IN (${placeholders})
      AND a.id != ?
      ORDER BY a.rating DESC, a.name
    `;
    const params = [...categoryIds, agent.id];
    alternatives.push(...db.all(query, params));
  }
  
  // Remove duplicates while preserving order
  const uniqueAlternatives = [];
  const seenIds = new Set();
  for (const alt of alternatives) {
    if (!seenIds.has(alt.id)) {
      seenIds.add(alt.id);
      uniqueAlternatives.push(alt);
    }
  }
  
  res.render('alternatives', {
    agent: { ...agent, slug: slug },
    alternatives: uniqueAlternatives
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

// POST /api/reviews — create a review for an agent (requires auth)
app.post('/api/reviews', authMiddleware, authenticatedLimiter, (req, res) => {
  try {
    const { agent_id, rating, review_text } = req.body;
    const user_id = req.operatorId;
    
    if (!agent_id || !rating) {
      return res.status(400).json({ error: 'Missing required fields: agent_id, rating' });
    }
    
    // Validate rating
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }
    
    // Check if agent exists
    const agent = db.prepare('SELECT id FROM agents WHERE id = ?').get(agent_id);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    // Check if user already reviewed this agent
    const existing = db.prepare('SELECT id FROM reviews WHERE agent_id = ? AND user_id = ?').get(agent_id, user_id);
    if (existing) {
      return res.status(409).json({ error: 'You have already reviewed this agent' });
    }
    
    // Insert review
    const now = Date.now();
    const result = db.prepare('INSERT INTO reviews (agent_id, user_id, rating, review_text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      agent_id,
      user_id,
      rating,
      review_text || null,
      now,
      now
    );
    
    // Update agent's review count and average rating
    const stats = db.prepare('SELECT AVG(rating) as avg_rating, COUNT(*) as review_count FROM reviews WHERE agent_id = ?').get(agent_id);
    db.prepare('UPDATE agents SET rating = ?, review_count = ? WHERE id = ?').run(
      stats.avg_rating ? Math.round(stats.avg_rating * 10) / 10 : null,
      stats.review_count,
      agent_id
    );
    
    res.json({ success: true, review_id: result.lastInsertRowid });
  } catch (err) {
    console.error(`[reviews] Error: ${err.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/reviews/:agent_id — get reviews for an agent
app.get('/api/reviews/:agent_id', (req, res) => {
  try {
    const agent_id = parseInt(req.params.agent_id, 10);
    
    // Check if agent exists
    const agent = db.prepare('SELECT id FROM agents WHERE id = ?').get(agent_id);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    const reviews = db.prepare('SELECT r.*, o.name as user_name FROM reviews r LEFT JOIN operators o ON r.user_id = o.id WHERE r.agent_id = ? ORDER BY r.created_at DESC').all(agent_id);
    
    res.json({ reviews });
  } catch (err) {
    console.error(`[reviews] Error: ${err.message}`);
    res.status(500).json({ error: 'Internal server error' });
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

// POST /api/agents/:id/invoke - Core marketplace transaction endpoint
// Caller sends task payload, AgentX proxies to agent endpoint_url, logs usage, returns response
app.post('/api/agents/:id/invoke', requireAuth, authenticatedLimiter, async (req, res) => {
  const agentId = req.params.id;
  const callerId = req.operatorId || 'api';
  
  try {
    // Get agent details
    const agent = db.get(
      'SELECT id, operator_id, name, endpoint_url, pricing, status FROM agents WHERE id = ?',
      [agentId]
    );
    
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    if (agent.status !== 'active') {
      return res.status(400).json({ error: 'Agent is not active', status: agent.status });
    }
    
    if (!agent.endpoint_url) {
      return res.status(400).json({ error: 'Agent has no endpoint_url configured' });
    }
    
    // Validate request body has task data
    const { task, context, metadata } = req.body;
    if (!task && !context) {
      return res.status(400).json({ error: 'Request must include "task" or "context" field' });
    }
    
    // Set default timeout (30s)
    const timeoutMs = req.body.timeout || 30000;
    
    // Record invocation start
    const startTime = Date.now();
    
    // Proxy request to agent endpoint
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    let agentResponse;
    try {
      agentResponse = await fetch(agent.endpoint_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-AgentX-Invocation': 'true',
          'X-AgentX-Caller': callerId
        },
        body: JSON.stringify({
          task,
          context,
          metadata,
          invocation_id: crypto.randomUUID(),
          invoked_at: Date.now()
        }),
        signal: controller.signal
      });
    } catch (fetchErr) {
      const elapsed = Date.now() - startTime;
      
      // Log error in agent_usage
      db.prepare(
        'INSERT INTO agent_usage (agent_id, api_key_hash, tasks_completed, tokens_used, response_time_ms, errors, created_at) VALUES (?, ?, 0, 0, ?, 1, ?)'
      ).run(agentId, null, elapsed, Date.now());
      
      if (fetchErr.name === 'AbortError') {
        return res.status(504).json({ error: 'Agent endpoint timeout', elapsed_ms: elapsed });
      }
      return res.status(502).json({ error: 'Agent endpoint unavailable', message: fetchErr.message });
    } finally {
      clearTimeout(timeoutId);
    }
    
    const elapsed = Date.now() - startTime;
    
    // Parse agent response
    let responseData;
    try {
      responseData = await agentResponse.json();
    } catch (parseErr) {
      const text = await agentResponse.text();
      return res.status(502).json({ error: 'Invalid JSON from agent', message: parseErr.message, raw: text.substring(0, 200) });
    }
    
    // Log successful invocation
    const tokensUsed = responseData.tokens_used || 0;
    db.prepare(
      'INSERT INTO agent_usage (agent_id, api_key_hash, tasks_completed, tokens_used, response_time_ms, errors, created_at) VALUES (?, ?, 1, ?, ?, 0, ?)'
    ).run(agentId, null, tokensUsed, elapsed, Date.now());
    
    // Return agent response to caller
    return res.json({
      success: true,
      agent_id: agentId,
      agent_name: agent.name,
      invocation_id: responseData.invocation_id || crypto.randomUUID(),
      elapsed_ms: elapsed,
      data: responseData
    });
    
  } catch (err) {
    console.error('[invoke] Error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
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
  
  // Seed database with Marco's sub-agents if empty
  seedMarcoAgents();
});

// Seed Marco's 6 sub-agents into the database
async function seedMarcoAgents() {
  const now = Date.now();
  
  // Check if we already have seeded agents
  const existingAgents = db.prepare('SELECT COUNT(*) as count FROM agents').get();
  if (existingAgents.count > 0) {
    console.log('[seed] Database already has agents, skipping seed');
    return;
  }
  
  console.log('[seed] Seeding Marco\'s 6 sub-agents...');
  
  // Marco's operator ID (hardcoded for seeding)
  const marcoOperatorId = 'marco-seed-operator';
  
  // Create Marco's operator if not exists
  db.prepare('INSERT OR IGNORE INTO operators (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
    marcoOperatorId,
    'marco@agentx.market',
    'Marco',
    now,
    now
  );
  
  // Create operator limits
  db.prepare('INSERT OR IGNORE INTO operator_limits (operator_id, agent_count, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
    marcoOperatorId,
    0,
    now,
    now
  );
  
  // Define the 6 sub-agents
  const agents = [
    {
      name: 'Marco (Revenue Ops)',
      description: 'Revenue operations specialist. Handles payments, billing, invoicing, and financial workflows. Integrates with Stripe, Lightning Network, and crypto payment processors.',
      capabilities: ['payment processing', 'billing automation', 'invoice generation', 'Lightning Network', 'Stripe integration'],
      endpoint_url: 'https://agentx.market/api/agents/marco-revenue-ops',
      pricing: 'Free for first 100 transactions, then $0.01 per transaction',
      health_endpoint_url: 'https://agentx.market/status',
      categories: ['Payments', 'Productivity']
    },
    {
      name: 'Deep (QA & Testing)',
      description: 'Quality assurance and testing specialist. Automated test suites, regression testing, smoke tests, and continuous integration workflows.',
      capabilities: ['automated testing', 'regression testing', 'smoke testing', 'CI/CD integration', 'bug tracking'],
      endpoint_url: 'https://agentx.market/api/agents/deep-qa',
      pricing: 'Free for open source projects, $29/month for commercial use',
      health_endpoint_url: 'https://agentx.market/status',
      categories: ['Monitoring', 'Productivity']
    },
    {
      name: 'Research (Competitor Intel)',
      description: 'Competitive intelligence and market research. Tracks competitors, analyzes market trends, and provides data-driven insights.',
      capabilities: ['competitor analysis', 'market research', 'trend analysis', 'data visualization', 'SWOT analysis'],
      endpoint_url: 'https://agentx.market/api/agents/research-intel',
      pricing: 'Free for basic reports, $49/month for premium insights',
      health_endpoint_url: 'https://agentx.market/status',
      categories: ['Data', 'Productivity']
    },
    {
      name: 'Security (Audit & Compliance)',
      description: 'Security auditing and compliance specialist. Vulnerability scanning, penetration testing, and compliance monitoring (GDPR, SOC2, HIPAA).',
      capabilities: ['vulnerability scanning', 'penetration testing', 'compliance monitoring', 'security audits', 'threat detection'],
      endpoint_url: 'https://agentx.market/api/agents/security-audit',
      pricing: 'Free for basic scans, $99/month for full compliance suite',
      health_endpoint_url: 'https://agentx.market/status',
      categories: ['Security', 'Monitoring']
    },
    {
      name: 'Marketing (Content & Leads)',
      description: 'Content marketing and lead generation specialist. SEO optimization, content creation, social media management, and lead nurturing.',
      capabilities: ['SEO optimization', 'content creation', 'social media management', 'lead generation', 'email marketing'],
      endpoint_url: 'https://agentx.market/api/agents/marketing-leads',
      pricing: 'Free for basic content, $59/month for full marketing suite',
      health_endpoint_url: 'https://agentx.market/status',
      categories: ['Productivity', 'Data']
    },
    {
      name: 'Coding (Development)',
      description: 'Software development and coding assistant. Code generation, debugging, refactoring, and technical documentation.',
      capabilities: ['code generation', 'debugging', 'refactoring', 'technical documentation', 'code review'],
      endpoint_url: 'https://agentx.market/api/agents/coding-dev',
      pricing: 'Free for personal projects, $39/month for commercial use',
      health_endpoint_url: 'https://agentx.market/status',
      categories: ['Productivity', 'Data']
    }
  ];
  
  // Insert each agent
  for (const agent of agents) {
    const stmt = db.prepare(
      'INSERT INTO agents (operator_id, name, description, capabilities, endpoint_url, pricing, status, health_check_passed_at, health_check_required_by, wallet_id, created_at, updated_at, health_endpoint_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    
    const result = stmt.run(
      marcoOperatorId,
      agent.name,
      agent.description,
      JSON.stringify(agent.capabilities),
      agent.endpoint_url,
      agent.pricing,
      'active',  // Mark as active since these are seeded agents
      now,  // health_check_passed_at
      now + 30 * 24 * 60 * 60 * 1000,  // health_check_required_by (30 days from now)
      null,  // wallet_id
      now,
      now,
      agent.health_endpoint_url
    );
    
    const agentId = result.lastInsertRowid;
    console.log(`[seed] Created agent: ${agent.name} (ID: ${agentId})`);
    
    // Assign categories
    for (const categoryName of agent.categories) {
      const category = db.prepare('SELECT id FROM categories WHERE name = ?').get(categoryName);
      if (category) {
        db.prepare('INSERT OR IGNORE INTO agent_categories (agent_id, category_id) VALUES (?, ?)').run(agentId, category.id);
        console.log(`[seed] Assigned category: ${categoryName} to ${agent.name}`);
      }
    }
    
    // Update operator agent count
    db.prepare('UPDATE operator_limits SET agent_count = agent_count + 1 WHERE operator_id = ?').run(marcoOperatorId);
  }
  
  console.log('[seed] Successfully seeded 6 sub-agents');
}
