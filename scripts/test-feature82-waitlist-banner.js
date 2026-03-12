#!/usr/bin/env node

const http = require('http');
const path = require('path');
const Database = require('better-sqlite3');

const BASE_URL = 'http://127.0.0.1:3000';
const TEST_EMAIL = `codex-feature82-${Date.now()}@example.com`;
const db = new Database(path.join(__dirname, '..', 'agentx.db'), { readonly: true });

function request(method, route, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      `${BASE_URL}${route}`,
      {
        method,
        headers: payload ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        } : {},
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const browseResponse = await request('GET', '/browse');
  assert(browseResponse.statusCode === 200, `Expected /browse 200, got ${browseResponse.statusCode}`);
  assert(browseResponse.body.includes('id="emailBanner"'), 'Browse page is missing email banner markup');
  assert(browseResponse.body.includes('data-scroll-threshold="0.5"'), 'Browse banner is missing the 50% scroll threshold');
  assert(
    browseResponse.body.includes('Get notified when new agents launch'),
    'Browse banner copy is missing'
  );
  assert(
    browseResponse.body.includes('action="/api/waitlist"'),
    'Browse banner form is not wired to /api/waitlist'
  );

  const signupResponse = await request('POST', '/api/waitlist', {
    email: TEST_EMAIL,
    sourcePath: '/browse',
  });
  assert(signupResponse.statusCode === 200, `Expected waitlist signup 200, got ${signupResponse.statusCode}`);
  assert(
    signupResponse.body.includes('"message":"Added to waitlist"'),
    `Unexpected waitlist signup response: ${signupResponse.body}`
  );

  const inserted = db.prepare('SELECT email FROM waitlist WHERE email = ?').get(TEST_EMAIL);
  assert(inserted?.email === TEST_EMAIL, 'Waitlist signup was not stored in the waitlist table');

  const duplicateResponse = await request('POST', '/api/waitlist', {
    email: TEST_EMAIL,
    sourcePath: '/browse',
  });
  assert(duplicateResponse.statusCode === 200, `Expected duplicate waitlist signup 200, got ${duplicateResponse.statusCode}`);
  assert(
    duplicateResponse.body.includes('"message":"Already on waitlist"'),
    `Unexpected duplicate waitlist response: ${duplicateResponse.body}`
  );

  console.log('feature82 waitlist banner flow verified');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
