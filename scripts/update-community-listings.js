#!/usr/bin/env node
/**
 * Update seed script to add 'community_listing' flag and 'claim_url' for skeleton agents
 * These are community-sourced listings that operators can claim
 */

const Database = require('better-sqlite3');

const db = new Database('/Users/marco/marco_web/agentx.db');

// Check if columns exist
let columns = [];
try {
  const pragma = db.prepare("PRAGMA table_info(agents)");
  columns = pragma.all().map(c => c.name);
} catch (e) {
  console.error('Error checking columns:', e.message);
  db.close();
  process.exit(1);
}

console.log('Current agents table columns:', columns.join(', '));

// Add columns if they don't exist
if (!columns.includes('community_listing')) {
  console.log('Adding community_listing column...');
  db.exec('ALTER TABLE agents ADD COLUMN community_listing INTEGER DEFAULT 0');
}

if (!columns.includes('claim_url')) {
  console.log('Adding claim_url column...');
  db.exec('ALTER TABLE agents ADD COLUMN claim_url TEXT');
}

// Update existing agents to be community listings
console.log('Updating agents to be community listings...');
const updateAgents = db.prepare(`
  UPDATE agents 
  SET community_listing = 1, 
      claim_url = endpoint_url,
      status = 'pending'
  WHERE id > 0
`);

const result = updateAgents.run();
console.log(`✅ Updated ${result.changes} agents as community listings`);

// Verify
const communityAgents = db.prepare(`
  SELECT a.name, a.description, a.endpoint_url, a.claim_url, a.community_listing 
  FROM agents a 
  WHERE a.community_listing = 1 
  LIMIT 10
`).all();

console.log('\n📋 Sample community listings:');
communityAgents.forEach(agent => {
  console.log(`   • ${agent.name}`);
  console.log(`     URL: ${agent.endpoint_url}`);
  console.log(`     Claim: ${agent.claim_url}`);
  console.log('');
});

db.close();
console.log('✅ Done!');