// Simple in-memory rate limiter per API key
// Uses a Map to track requests per key with sliding window

const rateLimitStore = new Map(); // keyId -> { requests: [], lastCleanup: timestamp }

// Cleanup old entries periodically
setInterval(() => {
  const oneMinuteAgo = Date.now() - 60000;
  for (const [keyId, data] of rateLimitStore.entries()) {
    const filtered = data.requests.filter(timestamp => timestamp > oneMinuteAgo);
    if (filtered.length === 0) {
      rateLimitStore.delete(keyId);
    } else {
      data.requests = filtered;
    }
  }
}, 60000); // Run every minute

function rateLimit(options = {}) {
  const windowMs = 60 * 1000; // 1 minute window
  const defaultLimit = 60;
  const defaultBurst = 100;
  
  return (req, res, next) => {
    const keyId = req.apiKey?.id;
    
    if (!keyId) {
      // Not an authenticated request - allow it through (or apply different rules)
      return next();
    }
    
    const limit = options.limit || req.apiKey.rateLimitPerMinute || defaultLimit;
    const burst = options.burst || req.apiKey.rateLimitBurst || defaultBurst;
    const now = Date.now();
    
    // Get or create rate limit data for this key
    if (!rateLimitStore.has(keyId)) {
      rateLimitStore.set(keyId, { requests: [], burstRemaining: burst });
    }
    
    const data = rateLimitStore.get(keyId);
    
    // Filter requests from the current window
    const validRequests = data.requests.filter(timestamp => now - timestamp < windowMs);
    data.requests = validRequests;
    
    const requestCount = data.requests.length;
    
    // Check burst limit
    if (data.burstRemaining <= 0) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded',
        message: 'Burst limit reached. Please slow down.',
        retryAfter: 60 
      });
    }
    
    // Check per-minute limit
    if (requestCount >= limit) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded',
        message: `Too many requests. Limit is ${limit} per minute.`,
        retryAfter: 60 
      });
    }
    
    // Add this request to the window
    data.requests.push(now);
    data.burstRemaining--;
    
    // Reset burst after some time (simplified - could be smarter)
    if (requestCount === 0) {
      data.burstRemaining = burst;
    }
    
    // Add rate limit headers
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', limit - requestCount - 1);
    res.setHeader('X-RateLimit-Reset', Math.ceil((now + windowMs) / 1000));
    
    next();
  };
}

module.exports = { rateLimit, rateLimitStore };
