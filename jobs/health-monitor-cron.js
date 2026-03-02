const { checkAllAgentsHealth } = require('../lib/health-monitor');

/**
 * Cron job: Check all agent health endpoints
 * Called every 5 minutes
 */
async function runHealthMonitor() {
  try {
    await checkAllAgentsHealth();
  } catch (err) {
    console.error('[health-monitor] Error:', err);
  }
}

module.exports = {
  runHealthMonitor
};
