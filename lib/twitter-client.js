const https = require('https');
const crypto = require('crypto');

const pendingTwitterAuth = new Map();
const AUTH_TTL_MS = 10 * 60 * 1000;

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function sha256Base64Url(value) {
  return crypto
    .createHash('sha256')
    .update(value)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function cleanExpiredAuthSessions() {
  const now = Date.now();
  for (const [state, record] of pendingTwitterAuth.entries()) {
    if ((now - record.createdAt) >= AUTH_TTL_MS) {
      pendingTwitterAuth.delete(state);
    }
  }
}

setInterval(cleanExpiredAuthSessions, 5 * 60 * 1000);

function createTwitterAuthUrl({ clientId, redirectUri, operatorId, returnTo }) {
  const state = base64UrlEncode(crypto.randomBytes(24));
  const codeVerifier = base64UrlEncode(crypto.randomBytes(48));
  const codeChallenge = sha256Base64Url(codeVerifier);

  pendingTwitterAuth.set(state, {
    operatorId,
    returnTo: typeof returnTo === 'string' ? returnTo : '/dashboard/social-connect',
    codeVerifier,
    createdAt: Date.now(),
  });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'tweet.read tweet.write users.read offline.access',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
}

function consumeTwitterAuthState(state) {
  if (!state || !pendingTwitterAuth.has(state)) return null;
  const record = pendingTwitterAuth.get(state);
  pendingTwitterAuth.delete(state);
  if (!record || (Date.now() - record.createdAt) >= AUTH_TTL_MS) return null;
  return record;
}

function readJsonResponse(res, resolve, reject) {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    try {
      const parsed = data ? JSON.parse(data) : {};
      if (res.statusCode >= 400) {
        const message = parsed.error_description || parsed.detail || parsed.title || parsed.error || `Twitter API error (${res.statusCode})`;
        const err = new Error(message);
        err.statusCode = res.statusCode;
        err.payload = parsed;
        reject(err);
        return;
      }
      resolve(parsed);
    } catch (err) {
      reject(err);
    }
  });
}

function exchangeTwitterCode({ code, codeVerifier, redirectUri, clientId, clientSecret }) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
      client_id: clientId,
    }).toString();

    const req = https.request({
      hostname: 'api.twitter.com',
      path: '/2/oauth2/token',
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => readJsonResponse(res, resolve, reject));

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function refreshTwitterToken({ refreshToken, clientId, clientSecret }) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      client_id: clientId,
    }).toString();

    const req = https.request({
      hostname: 'api.twitter.com',
      path: '/2/oauth2/token',
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => readJsonResponse(res, resolve, reject));

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function getTwitterMe(accessToken) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.twitter.com',
      path: '/2/users/me?user.fields=profile_image_url,username,name',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }, (res) => readJsonResponse(res, resolve, reject));

    req.on('error', reject);
    req.end();
  });
}

function postTweet(accessToken, text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ text });
    const req = https.request({
      hostname: 'api.twitter.com',
      path: '/2/tweets',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => readJsonResponse(res, resolve, reject));

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = {
  createTwitterAuthUrl,
  consumeTwitterAuthState,
  exchangeTwitterCode,
  refreshTwitterToken,
  getTwitterMe,
  postTweet,
};
