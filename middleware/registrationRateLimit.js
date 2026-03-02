/**
 * Registration Rate Limiting Middleware
 * 
 * Tracks agent registrations per operator to prevent abuse.
 * Limits: max 1 registration per hour per operator (configurable).
 */

const db = require('../db');
const abuseLimits = require('../config/abuse-limits');

// In-memory rate limit cache: { operator_id: timestamp }
const registrationCache = new Map();

/**
 * Rate limiting middleware for agent registration
 */
function registrationRateLimit(req, res, next) {
  const operatorId = req.operatorId;
  
  if (!operatorId) {
    return res.status(401).json({ 
      error: 'Not authenticated',
      reason: 'Operator ID required for registration'
    });
  }

  const now = Date.now();
  const lastRegistration = registrationCache.get(operatorId);
  const windowMs = abuseLimits.registrationRateLimitWindowMs;
  
  // Also check database for persistent tracking
  const dbLastReg = db.get(
    'SELECT last_registration_timestamp FROM operator_limits WHERE operator_id = ?',
    [operatorId]
  );
  
  const lastRegTime = dbLastReg?.last_registration_timestamp || lastRegistration;
  
  if (lastRegTime && (now - lastRegTime) < windowMs) {
    const timeRemainingMs = windowMs - (now - lastRegTime);
    const retryTime = new Date(now + timeRemainingMs);
    const retryTimeString = retryTime.getUTCHours().toString().padStart(2, '0') + ':' + 
                           retryTime.getUTCMinutes().toString().padStart(2, '0') + ' UTC';
    
    return res.status(429).json({ 
      error: 'Rate limit exceeded',
      reason: `Max 1 registration per hour. Try again at ${retryTimeString}`,
      retry_after: Math.ceil(timeRemainingMs / 1000)
    });
  }

  // Update cache and database
  registrationCache.set(operatorId, now);
  
  // Update operator_limits table
  const existing = db.get(
    'SELECT * FROM operator_limits WHERE operator_id = ?',
    [operatorId]
  );
  
  if (existing) {
    db.run(
      'UPDATE operator_limits SET last_registration_timestamp = ? WHERE operator_id = ?',
      [now, operatorId]
    );
  } else {
    db.run(
      'INSERT INTO operator_limits (operator_id, last_registration_timestamp, created_at) VALUES (?, ?, ?)',
      [operatorId, now, now]
    );
  }
  
  next();
}

/**
 * Check if operator can register (returns boolean, doesn't block)
 */
function canOperatorRegister(operatorId) {
  const now = Date.now();
  const lastRegistration = registrationCache.get(operatorId);
  const windowMs = abuseLimits.registrationRateLimitWindowMs;
  
  if (!lastRegistration) return true;
  return (now - lastRegistration) >= windowMs;
}

module.exports = {
  registrationRateLimit,
  canOperatorRegister,
  registrationCache,
};
