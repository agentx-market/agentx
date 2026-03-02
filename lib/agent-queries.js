const db = require("../db");

function getAgentBySlug(slug) {
  return db.get(`
    SELECT 
      id, name, slug, description, category, status, pricing, 
      capabilities, created_at, endpoint_url, uptime_percent
    FROM agents 
    WHERE slug = ?
  `, [slug]);
}

function getAgentUptimeTrend(agent_id) {
  // Return simulated 7-day trend based on uptime_percent
  const agent = db.get('SELECT uptime_percent, created_at FROM agents WHERE id = ?', [agent_id]);
  if (!agent) {
    return [];
  }
  // Use uptime_percent or default to 99.5
  const baseUptime = agent.uptime_percent || 99.5;
  // Generate 7 data points with slight variation
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const variation = (Math.random() * 4 - 2); // -2 to +2
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
