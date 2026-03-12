const db = require('../db');

/**
 * Calculate uptime percentage for an agent over the last 30 days
 * @param {string} agentId - Agent ID
 * @returns {{onlineChecks: number, totalChecks: number, uptimePercent: number}}
 */
function calculateUptime(agentId) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString();

  const total = db.get(
    'SELECT COUNT(*) as total FROM agents_health_history WHERE agent_id = ? AND check_timestamp >= ?',
    [agentId, thirtyDaysAgoStr]
  );

  const online = db.get(
    "SELECT COUNT(*) as online FROM agents_health_history WHERE agent_id = ? AND check_timestamp >= ? AND status IN ('online', 'degraded')",
    [agentId, thirtyDaysAgoStr]
  );

  const totalChecks = total?.total || 0;
  const onlineChecks = online?.online || 0;
  const uptimePercent = totalChecks > 0 ? Math.round((onlineChecks / totalChecks) * 1000) / 10 : 0;

  return {
    onlineChecks,
    totalChecks,
    uptimePercent
  };
}

module.exports = {
  calculateUptime
};
