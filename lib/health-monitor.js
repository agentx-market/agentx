const db = require('../db');
const { calculateUptime } = require('./uptime-calc');

/**
 * Check health of an individual agent endpoint
 * @param {string} url - Health endpoint URL
 * @returns {Promise<{status: 'online'|'offline'|'degraded', responseMs: number|null}>}
 */
async function checkEndpointHealth(url) {
  const https = require('https');
  const http = require('http');
  
  const start = Date.now();
  let status = 'offline';
  let responseMs = null;

  try {
    const isHttps = url.startsWith('https://');
    const client = isHttps ? https : http;
    
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('timeout'));
      }, 5000);
      
      const req = client.get(url, (res) => {
        clearTimeout(timeout);
        responseMs = Date.now() - start;
        resolve(res.statusCode >= 200 && res.statusCode < 300);
      });
      
      req.on('error', reject);
      req.setTimeout(5000, () => {
        req.destroy(new Error('timeout'));
      });
    });

    if (result && responseMs !== null) {
      status = responseMs < 2000 ? 'online' : 'degraded';
    }
  } catch (e) {
    console.error(`[health-monitor] Error checking ${url}:`, e.message);
    status = 'offline';
    responseMs = null;
  }

  return { status, responseMs };
}

/**
 * Check health of all agents with health endpoints
 */
async function checkAllAgentsHealth() {
  const agents = db.all(
    'SELECT id, name, health_endpoint_url FROM agents WHERE health_endpoint_url IS NOT NULL'
  );

  console.log(`[health-monitor] Checking ${agents.length} agents...`);

  for (const agent of agents) {
    const { status, responseMs } = await checkEndpointHealth(agent.health_endpoint_url);
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    
    db.run(
      'INSERT INTO agents_health_history (agent_id, check_timestamp, status, response_ms) VALUES (?, ?, ?, ?)',
      [agent.id, nowIso, status, responseMs]
    );

    const uptimePercent = calculateUptime(agent.id).uptimePercent;

    if (status === 'offline') {
      db.run(
        'UPDATE agents SET health_status = ?, last_health_check = ?, response_time_ms = ?, uptime_percent = ?, updated_at = ? WHERE id = ?',
        [status, nowIso, responseMs, uptimePercent, now, agent.id]
      );
    } else {
      db.run(
        'UPDATE agents SET health_status = ?, health_check_passed_at = ?, last_health_check = ?, response_time_ms = ?, uptime_percent = ?, updated_at = ? WHERE id = ?',
        [status, now, nowIso, responseMs, uptimePercent, now, agent.id]
      );
    }

    console.log(`[health-monitor] ${agent.name}: ${status}${responseMs ? ` (${responseMs}ms)` : ''}`);
  }

  console.log('[health-monitor] Health check complete');
}

module.exports = {
  checkEndpointHealth,
  checkAllAgentsHealth
};
