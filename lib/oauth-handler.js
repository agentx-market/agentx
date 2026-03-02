const https = require('https');
const crypto = require('crypto');
const db = require('../db');
const abuseLimits = require('../config/abuse-limits');

// CSRF state tokens (in-memory, short-lived)
const pendingStates = new Map();
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function generateState() {
  const state = crypto.randomBytes(24).toString('hex');
  pendingStates.set(state, Date.now());
  return state;
}

function verifyAndConsumeState(state) {
  if (!state || !pendingStates.has(state)) return false;
  const created = pendingStates.get(state);
  pendingStates.delete(state);
  return (Date.now() - created) < STATE_TTL_MS;
}

// Clean up expired states every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [state, created] of pendingStates.entries()) {
    if (now - created > STATE_TTL_MS) pendingStates.delete(state);
  }
}, 5 * 60 * 1000);

function exchangeGitHubCode(code, clientID, clientSecret) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      client_id: clientID,
      client_secret: clientSecret,
      code: code,
    });

    const options = {
      hostname: 'github.com',
      path: '/login/oauth/access_token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': postData.length,
        'Accept': 'application/json',
        'User-Agent': 'agentx-oauth',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error || !parsed.access_token) {
            reject(new Error(parsed.error_description || parsed.error || 'No access token returned'));
            return;
          }
          resolve(parsed.access_token);
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function exchangeGoogleCode(code, clientID, clientSecret) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      client_id: clientID,
      client_secret: clientSecret,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: require('../config/oauth').google.callbackURL,
    });

    const options = {
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': postData.length,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error || !parsed.access_token) {
            reject(new Error(parsed.error_description || parsed.error || 'No access token returned'));
            return;
          }
          resolve(parsed.access_token);
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function getGitHubUser(accessToken) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: '/user',
      method: 'GET',
      headers: {
        'Authorization': `token ${accessToken}`,
        'User-Agent': 'agentx-oauth',
      },
    };

    https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

function getGoogleUser(accessToken) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'www.googleapis.com',
      path: '/oauth2/v2/userinfo',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    };

    https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

function findOrCreateOperator(provider, providerData) {
  const { id, email, name, created_at: githubCreatedAt } = providerData;

  let operator = db.get(
    'SELECT * FROM operators WHERE provider = ? AND provider_id = ?',
    [provider, id.toString()]
  );

  if (!operator) {
    const githubAccountCreatedAt = githubCreatedAt ? new Date(githubCreatedAt).getTime() : null;

    db.run(
      'INSERT INTO operators (provider, provider_id, email, name, github_account_created_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [provider, id.toString(), email, name, githubAccountCreatedAt, Date.now()]
    );
    operator = db.get(
      'SELECT * FROM operators WHERE provider = ? AND provider_id = ?',
      [provider, id.toString()]
    );
  } else {
    // Update github_account_created_at if not set
    if (githubCreatedAt && !operator.github_account_created_at) {
      const ghTimestamp = new Date(githubCreatedAt).getTime();
      db.run(
        'UPDATE operators SET github_account_created_at = ? WHERE id = ?',
        [ghTimestamp, operator.id]
      );
      operator.github_account_created_at = ghTimestamp;
    }
  }

  // Check GitHub account age for abuse prevention
  if (provider === 'github' && operator.github_account_created_at) {
    const accountAgeMs = Date.now() - operator.github_account_created_at;
    const minAgeMs = abuseLimits.minGitHubAccountAgeDays * 24 * 60 * 60 * 1000;

    if (accountAgeMs < minAgeMs) {
      const error = new Error('GitHub account too new');
      error.status = 403;
      error.reason = `GitHub account must be ${abuseLimits.minGitHubAccountAgeDays}+ days old (account is ${Math.floor(accountAgeMs / (24 * 60 * 60 * 1000))} days old)`;
      throw error;
    }
  }

  return operator;
}

module.exports = {
  generateState,
  verifyAndConsumeState,
  exchangeGitHubCode,
  exchangeGoogleCode,
  getGitHubUser,
  getGoogleUser,
  findOrCreateOperator,
};
