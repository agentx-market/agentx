#!/usr/bin/env node

const http = require('http');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const db = require('../db');

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000';
const now = Date.now();
const operatorId = `github-smoke-agent-submission-${now}`;
const agentName = `Smoke Agent ${now}`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function getSessionSecret() {
  if (process.env.SESSION_SECRET) {
    return process.env.SESSION_SECRET;
  }

  try {
    const pid = execFileSync('pgrep', ['-f', 'node.*server.js'], { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean)[0];
    const processLine = execFileSync('ps', ['eww', '-p', pid], { encoding: 'utf8' });
    const match = processLine.match(/SESSION_SECRET=([^\s]+)/);
    if (match) {
      return match[1];
    }
  } catch (error) {
    // Fall through to the default used by the session middleware.
  }

  return 'dev-secret';
}

function createSessionCookie(operatorId) {
  const issuedAt = Date.now();
  const data = `${operatorId}:${issuedAt}`;
  const signature = crypto
    .createHmac('sha256', getSessionSecret())
    .update(data)
    .digest('hex');
  return `session=${data}:${signature}`;
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    redirect: 'manual',
    ...options,
  });
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text();
  return { response, payload };
}

async function main() {
  let healthServer;
  let createdAgentId = null;

  try {
    const submitPage = await request('/submit');
    assert(submitPage.response.ok, '/submit did not load');
    assert(typeof submitPage.payload === 'string' && submitPage.payload.includes('/auth/github?next=/register'), '/submit is missing the GitHub registration CTA');

    const oauthRedirect = await request('/auth/github?next=/register');
    assert(oauthRedirect.response.status === 302, '/auth/github did not redirect');
    const location = oauthRedirect.response.headers.get('location') || '';
    assert(location.startsWith('https://github.com/login/oauth/authorize'), 'GitHub OAuth redirect is incorrect');
    assert(location.includes(encodeURIComponent('http://127.0.0.1:3000/auth/github/callback')), 'GitHub OAuth callback is not based on the current host');

    db.prepare(`
      INSERT OR REPLACE INTO operators (id, github_id, email, name, github_username, github_account_created_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      operatorId,
      `${now}`,
      'smoke@agentx.market',
      'Smoke Operator',
      'smoke-operator',
      now - (60 * 24 * 60 * 60 * 1000),
      now,
      now
    );
    db.prepare(`
      INSERT OR IGNORE INTO operator_limits (operator_id, github_username, github_account_created_at, agent_count, created_at, updated_at)
      VALUES (?, ?, ?, 0, ?, ?)
    `).run(operatorId, 'smoke-operator', now - (60 * 24 * 60 * 60 * 1000), now, now);

    const sessionCookie = createSessionCookie(operatorId);

    healthServer = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    });
    await new Promise((resolve) => healthServer.listen(0, '127.0.0.1', resolve));
    const { port } = healthServer.address();
    const healthUrl = `http://127.0.0.1:${port}/health`;

    const registration = await request('/api/agents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
      },
      body: JSON.stringify({
        name: agentName,
        description: 'Smoke test operator-backed agent',
        category: 'Monitoring',
        endpoint_url: 'https://example.com/agent',
        health_endpoint_url: healthUrl,
        capabilities: ['smoke-test', 'health'],
      }),
    });

    assert(registration.response.status === 201, `Registration failed: ${JSON.stringify(registration.payload)}`);
    createdAgentId = registration.payload.id;
    assert(registration.payload.slug, 'Registration did not return a slug');

    const activation = await request(`/api/agents/${createdAgentId}/health-check`, {
      method: 'POST',
      headers: {
        'Cookie': sessionCookie,
      },
    });
    assert(activation.response.ok, `Health check activation failed: ${JSON.stringify(activation.payload)}`);

    const browse = await request(`/api/browse?mode=marketplace&search=${encodeURIComponent(agentName)}`);
    assert(browse.response.ok, 'Browse API request failed');
    const match = Array.isArray(browse.payload.agents)
      ? browse.payload.agents.find((agent) => agent.name === agentName)
      : null;
    assert(match, 'Registered agent did not appear in marketplace browse results');
    assert(Boolean(match.last_health_check), 'Browse result is missing the health badge signal');

    console.log(`Smoke submission passed for agent ${agentName} (${createdAgentId})`);
  } finally {
    if (healthServer) {
      await new Promise((resolve) => healthServer.close(resolve));
    }
    if (createdAgentId) {
      db.pragma('foreign_keys = OFF');
      db.prepare('DELETE FROM rate_limits WHERE api_key_hash IN (SELECT key_hash FROM api_keys WHERE agent_id = ?)').run(createdAgentId);
      db.prepare('DELETE FROM api_keys WHERE agent_id = ?').run(createdAgentId);
      db.prepare('DELETE FROM agent_categories WHERE agent_id = ?').run(createdAgentId);
      db.prepare('DELETE FROM agents WHERE id = ?').run(createdAgentId);
      db.pragma('foreign_keys = ON');
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
