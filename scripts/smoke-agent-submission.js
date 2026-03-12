#!/usr/bin/env node

const http = require('http');
const db = require('../db');

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000';
const now = Date.now();
const approvedAgentName = `Smoke Submit Approved ${now}`;
const pendingAgentName = `Smoke Submit Pending ${now}`;
const approvedEmail = `smoke-approved-${now}@agentx.market`;
const pendingEmail = `smoke-pending-${now}@agentx.market`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function main() {
  const category = db.prepare('SELECT name, slug FROM categories ORDER BY name LIMIT 1').get();
  assert(category, 'No categories found; seed categories before running smoke:submission');

  let approvedServer = null;
  let pendingServer = null;
  let approvedAgentId = null;
  let approvedSubmissionId = null;
  let pendingSubmissionId = null;

  try {
    const submitPage = await request('/submit');
    assert(submitPage.response.ok, '/submit did not load');
    assert(typeof submitPage.payload === 'string' && submitPage.payload.includes('Submit your agent without touching the API.'), '/submit is missing the public submission headline');
    assert(typeof submitPage.payload === 'string' && submitPage.payload.includes('name="contactEmail"'), '/submit is missing the contact email field');
    assert(typeof submitPage.payload === 'string' && submitPage.payload.includes('name="pricingModel"'), '/submit is missing the pricing model field');

    approvedServer = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    });
    await listen(approvedServer);
    const approvedUrl = `http://127.0.0.1:${approvedServer.address().port}/health`;

    pendingServer = http.createServer((req, res) => {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'unavailable' }));
    });
    await listen(pendingServer);
    const pendingUrl = `http://127.0.0.1:${pendingServer.address().port}/health`;

    const approvedSubmission = await request('/api/submit-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentName: approvedAgentName,
        endpointUrl: approvedUrl,
        description: 'Smoke test public submission that should auto-approve.',
        category: category.slug,
        pricingModel: 'free',
        logoUrl: 'https://example.com/logo.png',
        contactEmail: approvedEmail,
      }),
    });

    assert(approvedSubmission.response.status === 201, `Approved submission failed: ${JSON.stringify(approvedSubmission.payload)}`);
    assert(approvedSubmission.payload.autoApproved === true, 'Approved submission was not auto-approved');
    assert(approvedSubmission.payload.reviewStatus === 'approved', 'Approved submission review status is incorrect');
    assert(typeof approvedSubmission.payload.listingUrl === 'string' && approvedSubmission.payload.listingUrl.startsWith('/agents/'), 'Approved submission did not return a listing URL');

    approvedSubmissionId = approvedSubmission.payload.submissionId;
    approvedAgentId = approvedSubmission.payload.agentId;
    assert(approvedSubmissionId, 'Approved submission is missing submissionId');
    assert(approvedAgentId, 'Approved submission is missing agentId');

    const approvedQueueRow = db.prepare(`
      SELECT id, review_status, auto_approved, health_check_status_code, agent_id
      FROM agent_submissions
      WHERE id = ?
    `).get(approvedSubmissionId);
    assert(approvedQueueRow, 'Approved submission did not persist to agent_submissions');
    assert(approvedQueueRow.review_status === 'approved', 'Approved submission queue row has wrong review status');
    assert(approvedQueueRow.auto_approved === 1, 'Approved submission queue row did not mark auto_approved');
    assert(approvedQueueRow.health_check_status_code === 200, 'Approved submission did not store the 200 health check result');
    assert(approvedQueueRow.agent_id === approvedAgentId, 'Approved submission queue row is missing the linked agent');

    const approvedAgent = db.prepare(`
      SELECT id, name, status, endpoint_url, health_endpoint_url, community_listing, health_status
      FROM agents
      WHERE id = ?
    `).get(approvedAgentId);
    assert(approvedAgent, 'Approved submission did not create an agent');
    assert(approvedAgent.name === approvedAgentName, 'Approved agent name is incorrect');
    assert(approvedAgent.status === 'active', 'Approved agent is not active');
    assert(approvedAgent.endpoint_url === approvedUrl, 'Approved agent endpoint URL is incorrect');
    assert(approvedAgent.health_endpoint_url === approvedUrl, 'Approved agent health endpoint URL is incorrect');
    assert(approvedAgent.community_listing === 1, 'Approved agent is not marked as a community listing');
    assert(approvedAgent.health_status === 'online', 'Approved agent health status is incorrect');

    const pendingSubmission = await request('/api/submit-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentName: pendingAgentName,
        endpointUrl: pendingUrl,
        description: 'Smoke test public submission that should stay pending.',
        category: category.slug,
        pricingModel: 'paid',
        logoUrl: '',
        contactEmail: pendingEmail,
      }),
    });

    assert(pendingSubmission.response.status === 202, `Pending submission failed: ${JSON.stringify(pendingSubmission.payload)}`);
    assert(pendingSubmission.payload.autoApproved === false, 'Pending submission should not auto-approve');
    assert(pendingSubmission.payload.reviewStatus === 'pending', 'Pending submission review status is incorrect');
    assert(pendingSubmission.payload.agentId === null, 'Pending submission should not create an agent');

    pendingSubmissionId = pendingSubmission.payload.submissionId;
    assert(pendingSubmissionId, 'Pending submission is missing submissionId');

    const pendingQueueRow = db.prepare(`
      SELECT id, review_status, auto_approved, health_check_status_code, agent_id
      FROM agent_submissions
      WHERE id = ?
    `).get(pendingSubmissionId);
    assert(pendingQueueRow, 'Pending submission did not persist to agent_submissions');
    assert(pendingQueueRow.review_status === 'pending', 'Pending submission queue row has wrong review status');
    assert(pendingQueueRow.auto_approved === 0, 'Pending submission queue row incorrectly marked auto_approved');
    assert(pendingQueueRow.health_check_status_code === 503, 'Pending submission did not store the failing health check result');
    assert(pendingQueueRow.agent_id === null, 'Pending submission should not link an agent');

    console.log(`Smoke submission passed for approved queue item ${approvedSubmissionId} and pending queue item ${pendingSubmissionId}`);
  } finally {
    if (approvedServer) {
      await close(approvedServer);
    }
    if (pendingServer) {
      await close(pendingServer);
    }

    db.exec('PRAGMA foreign_keys = OFF');
    if (approvedAgentId) {
      db.prepare('DELETE FROM agent_categories WHERE agent_id = ?').run(approvedAgentId);
      db.prepare('DELETE FROM agents WHERE id = ?').run(approvedAgentId);
    }
    if (approvedSubmissionId) {
      db.prepare('DELETE FROM agent_submissions WHERE id = ?').run(approvedSubmissionId);
    }
    if (pendingSubmissionId) {
      db.prepare('DELETE FROM agent_submissions WHERE id = ?').run(pendingSubmissionId);
    }
    db.exec('PRAGMA foreign_keys = ON');
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
