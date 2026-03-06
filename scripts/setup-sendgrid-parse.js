#!/usr/bin/env node
// Configure SendGrid Inbound Parse for mail.agentx.market
// Requires an API key with "Inbound Parse" permissions (user.webhooks.parse.settings.*)
//
// Usage: SENDGRID_API_KEY=SG.xxx node scripts/setup-sendgrid-parse.js
// Or:    node scripts/setup-sendgrid-parse.js  (uses hardcoded key below)

const client = require('@sendgrid/client');

const API_KEY = process.env.SENDGRID_API_KEY;
if (!API_KEY) { console.error('Set SENDGRID_API_KEY env var'); process.exit(1); }
client.setApiKey(API_KEY);

async function listExisting() {
  console.log('=== Existing Inbound Parse Settings ===');
  try {
    const [response] = await client.request({
      method: 'GET',
      url: '/v3/user/webhooks/parse/settings',
    });
    console.log(JSON.stringify(response.body, null, 2));
    return response.body;
  } catch (e) {
    console.error('GET failed:', e.response?.body || e.message);
    return null;
  }
}

async function createParseSetting() {
  console.log('\n=== Creating Inbound Parse Setting ===');
  const data = {
    hostname: 'mail.agentx.market',
    url: 'https://agentx.market/webhooks/sendgrid',
    spam_check: true,
    send_raw: false,
  };
  console.log('Payload:', JSON.stringify(data, null, 2));

  try {
    const [response] = await client.request({
      method: 'POST',
      url: '/v3/user/webhooks/parse/settings',
      body: data,
    });
    console.log('SUCCESS:', JSON.stringify(response.body, null, 2));
    return response.body;
  } catch (e) {
    console.error('POST failed:', e.response?.body || e.message);
    return null;
  }
}

async function checkScopes() {
  try {
    const [response] = await client.request({
      method: 'GET',
      url: '/v3/scopes',
    });
    const scopes = response.body.scopes || [];
    const parseScopes = scopes.filter(s => s.includes('parse') || s.includes('webhook'));
    console.log('\n=== API Key Scopes ===');
    console.log('Total scopes:', scopes.length);
    console.log('Parse/webhook scopes:', parseScopes.length > 0 ? parseScopes : 'NONE — key lacks Inbound Parse permissions');
    console.log('All scopes:', scopes.join(', '));
    return scopes;
  } catch (e) {
    console.error('Scopes check failed:', e.response?.body || e.message);
    return [];
  }
}

(async () => {
  const scopes = await checkScopes();
  const hasParseScope = scopes.some(s => s.includes('parse'));

  if (!hasParseScope) {
    console.log('\n*** WARNING: This API key does not have Inbound Parse permissions. ***');
    console.log('*** Go to SendGrid dashboard > Settings > API Keys and either: ***');
    console.log('***   1. Edit this key to add "Inbound Parse" full access, or ***');
    console.log('***   2. Create a new key with "Inbound Parse" permissions. ***');
    console.log('*** Then re-run this script. ***\n');
    console.log('Alternatively, configure Inbound Parse manually in the SendGrid dashboard:');
    console.log('  Settings > Inbound Parse > Add Host & URL');
    console.log('  Hostname: mail.agentx.market');
    console.log('  URL: https://agentx.market/webhooks/sendgrid');
    console.log('  Check spam: Yes');
    console.log('  Send raw: No');
    return;
  }

  await listExisting();
  await createParseSetting();
  await listExisting();
})();
