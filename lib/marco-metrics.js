const Database = require('better-sqlite3');

const METRICS_DB_PATH = '/Users/marco/marco_memory/metrics.db';

let metricsDb = null;

function getMetricsDb() {
  if (!metricsDb) {
    metricsDb = new Database(METRICS_DB_PATH, {
      readonly: true,
      fileMustExist: true
    });
  }

  return metricsDb;
}

function safePercent(numerator, denominator) {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function getMarcoMetrics() {
  try {
    const db = getMetricsDb();

    const latestSnapshot = db.prepare(`
      SELECT
        timestamp,
        gateway_running,
        proxy_running,
        ollama_running,
        cpu_percent,
        ram_used_mb,
        models_loaded
      FROM system_snapshots
      ORDER BY timestamp DESC
      LIMIT 1
    `).get();

    const uptime24h = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN gateway_running = 1 AND proxy_running = 1 THEN 1 ELSE 0 END) AS healthy
      FROM system_snapshots
      WHERE timestamp >= datetime('now', '-24 hours')
    `).get();

    const uptime7d = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN gateway_running = 1 AND proxy_running = 1 THEN 1 ELSE 0 END) AS healthy
      FROM system_snapshots
      WHERE timestamp >= datetime('now', '-7 days')
    `).get();

    const products = db.prepare(`
      SELECT COUNT(DISTINCT active_project) AS product_count
      FROM requests
      WHERE active_project IS NOT NULL AND TRIM(active_project) != ''
    `).get();

    const taskSummary = db.prepare(`
      SELECT
        COUNT(*) AS completed_total,
        COUNT(DISTINCT date(timestamp)) AS active_days,
        MAX(timestamp) AS last_completed_at
      FROM requests
      WHERE error IS NULL OR error = ''
    `).get();

    const recentTasks = db.prepare(`
      SELECT
        cron_job_name,
        active_role,
        active_project,
        MAX(timestamp) AS last_run,
        COUNT(*) AS completed_runs,
        ROUND(AVG(total_ms)) AS avg_ms
      FROM requests
      WHERE (error IS NULL OR error = '')
        AND cron_job_name IS NOT NULL
        AND TRIM(cron_job_name) != ''
      GROUP BY cron_job_name, active_role, active_project
      ORDER BY last_run DESC
      LIMIT 5
    `).all();

    const refreshConfig = db.prepare(`
      SELECT value
      FROM dashboard_config
      WHERE key = 'refresh_interval'
      LIMIT 1
    `).get();

    let loadedModels = [];
    if (latestSnapshot && latestSnapshot.models_loaded) {
      try {
        loadedModels = JSON.parse(latestSnapshot.models_loaded);
      } catch (_err) {
        loadedModels = [];
      }
    }

    return {
      available: true,
      currentStatus: !!(latestSnapshot && latestSnapshot.gateway_running && latestSnapshot.proxy_running),
      lastSnapshotAt: latestSnapshot ? latestSnapshot.timestamp : null,
      uptime24h: safePercent(Number(uptime24h.healthy || 0), Number(uptime24h.total || 0)),
      uptime7d: safePercent(Number(uptime7d.healthy || 0), Number(uptime7d.total || 0)),
      completedTasks: Number(taskSummary.completed_total || 0),
      activeDays: Number(taskSummary.active_days || 0),
      lastCompletedAt: taskSummary.last_completed_at || null,
      productCount: Number(products.product_count || 0),
      refreshIntervalSeconds: Number(refreshConfig && refreshConfig.value ? refreshConfig.value : 15),
      cpuPercent: latestSnapshot ? Number(latestSnapshot.cpu_percent || 0) : null,
      ramUsedGb: latestSnapshot ? Math.round((Number(latestSnapshot.ram_used_mb || 0) / 1024) * 10) / 10 : null,
      ollamaRunning: !!(latestSnapshot && latestSnapshot.ollama_running),
      loadedModels,
      recentTasks: recentTasks.map((task) => ({
        cronJobName: task.cron_job_name,
        activeRole: task.active_role,
        activeProject: task.active_project,
        lastRun: task.last_run,
        completedRuns: Number(task.completed_runs || 0),
        avgMs: Number(task.avg_ms || 0)
      }))
    };
  } catch (error) {
    return {
      available: false,
      error: error.message
    };
  }
}

module.exports = { getMarcoMetrics };
