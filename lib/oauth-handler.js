const https = require('https');
const crypto = require('crypto');
const db = require('../db');
const abuseLimits = require('../config/abuse-limits');
const email = require('../email');
const lwWallet = require('./lw-wallet');

// CSRF state tokens (in-memory, short-lived)
const pendingStates = new Map();
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function generateState(returnTo = null) {
  const state = crypto.randomBytes(24).toString('hex');
  pendingStates.set(state, {
    createdAt: Date.now(),
    returnTo: typeof returnTo === 'string' ? returnTo : null,
  });
  return state;
}

function consumeState(state) {
  if (!state || !pendingStates.has(state)) return null;
  const record = pendingStates.get(state);
  pendingStates.delete(state);
  if (!record || (Date.now() - record.createdAt) >= STATE_TTL_MS) {
    return null;
  }
  return record;
}

function verifyAndConsumeState(state) {
  return Boolean(consumeState(state));
}

// Clean up expired states every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [state, record] of pendingStates.entries()) {
    if (now - record.createdAt > STATE_TTL_MS) pendingStates.delete(state);
  }
}, 5 * 60 * 1000);

function exchangeGitHubCode(code, clientID, clientSecret, redirectUri) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      client_id: clientID,
      client_secret: clientSecret,
      code: code,
      ...(redirectUri ? { redirect_uri: redirectUri } : {}),
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

async function findOrCreateOperator(provider, providerData) {
  const { id, email: emailAddress, name, created_at: githubCreatedAt, login } = providerData;
  const providerId = id.toString();
  const now = Date.now();
  const providerColumn = provider === 'github' ? 'github_id' : 'google_id';
  const githubAccountCreatedAt = githubCreatedAt ? new Date(githubCreatedAt).getTime() : null;
  const displayName = name || login || emailAddress || `${provider}-${providerId}`;
  const githubUsername = provider === 'github' ? login || null : null;

  let operator = db.get(
    `SELECT * FROM operators WHERE ${providerColumn} = ?`,
    [providerId]
  );

  if (!operator) {
    db.run(
      `INSERT INTO operators (
        id, github_id, google_id, email, name, github_username,
        github_account_created_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `${provider}-${providerId}`,
        provider === 'github' ? providerId : null,
        provider === 'google' ? providerId : null,
        emailAddress || null,
        displayName,
        githubUsername,
        githubAccountCreatedAt,
        now,
        now,
      ]
    );
    operator = db.get(`SELECT * FROM operators WHERE ${providerColumn} = ?`, [providerId]);
    db.run(
      'INSERT OR IGNORE INTO operator_limits (operator_id, github_username, github_account_created_at, agent_count, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)',
      [operator.id, githubUsername, githubAccountCreatedAt, now, now]
    );
  } else {
    const updates = [];
    const params = [];

    if (emailAddress && emailAddress !== operator.email) {
      updates.push('email = ?');
      params.push(emailAddress);
    }

    if (displayName && displayName !== operator.name) {
      updates.push('name = ?');
      params.push(displayName);
    }

    if (githubUsername && githubUsername !== operator.github_username) {
      updates.push('github_username = ?');
      params.push(githubUsername);
    }

    if (githubAccountCreatedAt && !operator.github_account_created_at) {
      updates.push('github_account_created_at = ?');
      params.push(githubAccountCreatedAt);
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      params.push(now, operator.id);
      db.run(`UPDATE operators SET ${updates.join(', ')} WHERE id = ?`, params);
      operator = db.get(`SELECT * FROM operators WHERE ${providerColumn} = ?`, [providerId]);
    }

    db.run(
      'INSERT OR IGNORE INTO operator_limits (operator_id, github_username, github_account_created_at, agent_count, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)',
      [operator.id, githubUsername || operator.github_username || null, githubAccountCreatedAt || operator.github_account_created_at || null, now, now]
    );
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

  if (!operator.wallet_id) {
    try {
      const walletId = lwWallet.registerOperatorWallet(displayName);
      db.run('UPDATE operators SET wallet_id = ?, updated_at = ? WHERE id = ?', [walletId, now, operator.id]);
      operator.wallet_id = walletId;
      operator.updated_at = now;
      console.log(`[oauth] Provisioned wallet ${walletId} for operator ${operator.id}`);
    } catch (err) {
      console.error(`[oauth] Failed to provision wallet for operator ${operator.id}:`, err.message);
    }
  }

  if (emailAddress && !operator.welcome_email_sent) {
    try {
      await email.sendWelcome(emailAddress, displayName);
      db.run('UPDATE operators SET welcome_email_sent = ?, updated_at = ? WHERE id = ?', [1, now, operator.id]);
      operator.welcome_email_sent = 1;
      operator.updated_at = now;
      console.log(`[oauth] Welcome email sent to ${emailAddress}`);
    } catch (err) {
      console.error(`[oauth] Failed to send welcome email to ${emailAddress}:`, err.message);
    }
  }

  return operator;
}

module.exports = {
  generateState,
  consumeState,
  verifyAndConsumeState,
  exchangeGitHubCode,
  exchangeGoogleCode,
  getGitHubUser,
  getGoogleUser,
  findOrCreateOperator,
};
