const crypto = require('crypto');
const sessionSecret = process.env.SESSION_SECRET || 'dev-secret';

function createSessionToken(operatorId) {
  const timestamp = Date.now();
  const data = `${operatorId}:${timestamp}`;
  const signature = crypto
    .createHmac('sha256', sessionSecret)
    .update(data)
    .digest('hex');
  return `${data}:${signature}`;
}

function verifySessionToken(token) {
  const parts = token.split(':');
  if (parts.length !== 3) return null;

  const [operatorId, timestamp, signature] = parts;
  const data = `${operatorId}:${timestamp}`;
  const expected = crypto
    .createHmac('sha256', sessionSecret)
    .update(data)
    .digest('hex');

  if (signature !== expected) return null;
  if (Date.now() - parseInt(timestamp) > 30 * 24 * 60 * 60 * 1000) return null; // 30 days

  return operatorId;
}

function sessionMiddleware(req, res, next) {
  const token = req.cookies?.session;
  if (token) {
    const operatorId = verifySessionToken(token);
    if (operatorId) {
      req.operatorId = operatorId;
    }
  }
  next();
}

module.exports = {
  createSessionToken,
  verifySessionToken,
  sessionMiddleware,
};
