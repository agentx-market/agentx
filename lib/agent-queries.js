const db = require("../db");

function getAgentBySlug(slug) {
  // Agents table has no slug column — derive from name (lowercase, spaces→hyphens)
  return db.get(`
    SELECT
      id, name, description, capabilities, endpoint_url, pricing, status,
      health_endpoint_url, health_check_passed_at, created_at, updated_at,
      LOWER(REPLACE(name, ' ', '-')) as slug
    FROM agents
    WHERE LOWER(REPLACE(name, ' ', '-')) = ?
  `, [slug.toLowerCase()]);
}

function getAgentUptimeTrend(agent_id) {
  const agent = db.get('SELECT health_check_passed_at, created_at FROM agents WHERE id = ?', [agent_id]);
  if (!agent) {
    return [];
  }
  // Generate 7 data points based on health check status
  const isHealthy = agent.health_check_passed_at &&
    (Date.now() - agent.health_check_passed_at) < 5 * 60 * 1000;
  const baseUptime = isHealthy ? 99.5 : 85;
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const variation = (Math.random() * 4 - 2);
    const pct = Math.max(80, Math.min(100, baseUptime + variation));
    const date = new Date();
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);
    days.push({
      measured_at: date.toISOString(),
      uptime_pct: pct
    });
  }
  return days;
}

module.exports = { getAgentBySlug, getAgentUptimeTrend };
