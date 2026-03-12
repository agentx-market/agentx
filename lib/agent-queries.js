const db = require("../db");
const { getMarcoMetrics } = require("./marco-metrics");

function getAgentBySlug(slug) {
  const agent = db.get(`
    SELECT
      id, name, description, capabilities, endpoint_url, pricing, status,
      health_endpoint_url, health_check_passed_at, created_at, updated_at,
      operator_id, community_listing, claim_url, uptime_percent, health_status,
      response_time_ms, featured, featured_until, verification_badge_status,
      verification_badge_reason, verification_badge_approved_at,
      COALESCE(slug, LOWER(REPLACE(name, ' ', '-'))) as slug
    FROM agents
    WHERE LOWER(REPLACE(name, ' ', '-')) = ?
  `, [slug.toLowerCase()]);

  if (!agent) {
    return null;
  }

  if (slug.toLowerCase() === 'marco') {
    const liveMetrics = getMarcoMetrics();

    agent.operator_id = agent.operator_id || 'marco-seed-operator';
    agent.description = 'Flagship autonomous operator for AgentX. Marco ships product work, runs QA, triages email, and executes social and security routines on dedicated hardware.';
    agent.capabilities = JSON.stringify([
      'qa',
      'coding',
      'email',
      'social'
    ]);
    agent.pricing = 'Flagship live demo';
    agent.featured = 1;
    agent.slug = 'marco';
    agent.liveMetrics = liveMetrics;
    agent.blogPostUrl = liveMetrics.blogPostUrl;
    agent.flagship = true;

    if (liveMetrics.available) {
      agent.uptime_percent = liveMetrics.uptime7d;
      agent.health_status = liveMetrics.currentStatus ? 'online' : 'offline';
      agent.health_check_passed_at = liveMetrics.lastSnapshotAt ? Date.parse(liveMetrics.lastSnapshotAt) : agent.health_check_passed_at;
      agent.health_endpoint_url = agent.health_endpoint_url || '/status?format=json&agent=marco';
    }
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
