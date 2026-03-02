const db = require('../db');

/**
 * Cleanup job: Delete health history rows older than 30 days
 * Called daily
 */
async function cleanupHealthHistory() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoff = thirtyDaysAgo.toISOString();

  const result = db.get(
    'SELECT COUNT(*) as count FROM agents_health_history WHERE check_timestamp < ?',
    [cutoff]
  );

  const rowsToDelete = result?.count || 0;

  if (rowsToDelete > 0) {
    db.run(
      'DELETE FROM agents_health_history WHERE check_timestamp < ?',
      [cutoff]
    );
    console.log(`[health-history-cleanup] Deleted ${rowsToDelete} old health history rows`);
  } else {
    console.log('[health-history-cleanup] No old rows to delete');
  }
}

module.exports = {
  cleanupHealthHistory
};
