const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('./db');

// Get first agent
const agent = db.get("SELECT id FROM agents LIMIT 1");
if (!agent) {
  console.log('No agents found');
  process.exit(1);
}

const apiKey = crypto.randomBytes(32).toString('hex');
const keyPrefix = apiKey.substring(0, 8);

bcrypt.hash(apiKey, 10, (err, hashedKey) => {
  if (err) { console.error(err); process.exit(1); }
  const result = db.run(
    "INSERT INTO api_keys (agent_id, key_hash, key_prefix) VALUES (?, ?, ?)",
    [agent.id, hashedKey, keyPrefix]
  );
  console.log('Test API Key: ' + apiKey);
  console.log('Agent ID: ' + agent.id);
});
