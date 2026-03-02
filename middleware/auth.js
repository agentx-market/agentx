const { verifyApiKey } = require('../auth');
const db = require('../db');

const authMiddleware = async (req, res, next) => {
  const apiKey = req.headers['x-agentx-key'];
  
  if (!apiKey) {
    return res.status(401).json({ error: 'Missing X-AgentX-Key header' });
  }
  
  try {
    // Find agent by API key prefix for fast lookup
    const keyPrefix = apiKey.substring(0, 8);
    const row = db.get("SELECT agents.*, api_keys.key_hash FROM agents JOIN api_keys ON agents.id = api_keys.agent_id WHERE api_keys.key_prefix = ?", [keyPrefix]);
    
    if (!row) {
      return res.status(401).json({ error: 'Invalid API key' });
    }
    
    const isValid = await verifyApiKey(apiKey, row.key_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid API key' });
    }
    
    // Update last_used_at
    db.run('UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE key_hash = ?', [row.key_hash]);
    
    req.agentId = row.id;
    req.keyHash = row.key_hash;
    next();
  } catch (err) {
    res.status(500).json({ error: 'Auth error', details: err.message });
  }
};

module.exports = authMiddleware;
