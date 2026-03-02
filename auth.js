const crypto = require('crypto');
const bcrypt = require('bcrypt');

function generateApiKey() {
  return crypto.randomBytes(32).toString('hex');
}

async function hashApiKey(apiKey) {
  return await bcrypt.hash(apiKey, 10);
}

async function verifyApiKey(plainKey, hashedKey) {
  return await bcrypt.compare(plainKey, hashedKey);
}

module.exports = { generateApiKey, hashApiKey, verifyApiKey };
