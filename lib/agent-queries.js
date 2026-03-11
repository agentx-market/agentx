const db = require("../db");
const { getMarcoMetrics } = require("./marco-metrics");

function getAgentBySlug(slug) {
  const agent = db.get(`
    SELECT
      id, name, description, capabilities, endpoint_url, pricing, status,
      health_endpoint_url, health_check_passed_at, created_at, updated_at,
      operator_id, community_listing, claim_url, uptime_percent,
      LOWER(REPLACE(name, ' ', '-')) as slug
    FROM agents
    WHERE LOWER(REPLACE(name, ' ', '-')) = ?
  `, [slug.toLowerCase()]);

  if (!agent) {
    return null;
  }

  if (slug.toLowerCase() === 'marco') {
    agent.operator_id = agent.operator_id || 'marco-live-demo';
    agent.description = 'Autonomous business operator running on dedicated hardware. Marco monitors uptime, clears inboxes, ships code, and keeps LightningFaucet operating with scheduled QA and security loops.';
    agent.capabilities = JSON.stringify([
      'security sweeps',
      'regression testing',
      'inbox triage',
      'business operations',
      'code shipping'
    ]);
    agent.pricing = 'Live internal demo';
    agent.liveMetrics = getMarcoMetrics();
  }

  return agent;
}

function getAgentUptimeTrend(agent_id) {
  const dailySnapshots = db.all(`
    SELECT snapshot_date as measured_at, uptime_percent as uptime_pct
    FROM agent_health_history
    WHERE agent_id = ?
    ORDER BY snapshot_date DESC
    LIMIT 7
  `, [agent_id]);

  if (dailySnapshots.length > 0) {
    return dailySnapshots.reverse();
  }

  const rawChecks = db.all(`
    SELECT
      date(check_timestamp) as measured_at,
      ROUND(
        SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) * 100.0 / COUNT(*),
        1
      ) as uptime_pct
    FROM agents_health_history
    WHERE agent_id = ?
    GROUP BY date(check_timestamp)
    ORDER BY measured_at DESC
    LIMIT 7
  `, [agent_id]);

  if (rawChecks.length > 0) {
    return rawChecks.reverse();
  }

  return [];
}

module.exports = { getAgentBySlug, getAgentUptimeTrend };
