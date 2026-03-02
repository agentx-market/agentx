const db = require("../db");

function recordUsage(agent_id, api_key_hash, data) {
  const { tasks_completed = 0, tokens_used = 0, response_time_ms = 0, errors = 0 } = data;
  
  // Validate
  if (typeof tasks_completed !== 'number' || tasks_completed < 0) {
    throw new Error('Invalid tasks_completed: must be non-negative integer');
  }
  if (typeof tokens_used !== 'number' || tokens_used < 0) {
    throw new Error('Invalid tokens_used: must be non-negative integer');
  }
  if (typeof response_time_ms !== 'number' || response_time_ms < 0) {
    throw new Error('Invalid response_time_ms: must be non-negative');
  }
  if (typeof errors !== 'number' || errors < 0) {
    throw new Error('Invalid errors: must be non-negative integer');
  }
  
  const result = db.run(
    `INSERT INTO agent_usage (agent_id, api_key_hash, tasks_completed, tokens_used, response_time_ms, errors)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [agent_id, api_key_hash, tasks_completed, tokens_used, response_time_ms, errors]
  );
  
  return { usage_id: result.lastID, recorded_at: new Date().toISOString() };
}

function getAgentUsageSummary(agent_id, days = 7) {
  return db.get(
    `SELECT
       COUNT(*) as total_reports,
       SUM(tasks_completed) as total_tasks,
       SUM(tokens_used) as total_tokens,
       AVG(response_time_ms) as avg_response_time_ms,
       SUM(errors) as total_errors,
       MIN(created_at) as first_report,
       MAX(created_at) as last_report
     FROM agent_usage
     WHERE agent_id = ? AND created_at >= datetime('now', '-' || ? || ' days')`,
    [agent_id, days]
  );
}

function getAgentUsageHistory(agent_id, limit = 100) {
  return db.all(
    `SELECT id, tasks_completed, tokens_used, response_time_ms, errors, created_at
     FROM agent_usage
     WHERE agent_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [agent_id, limit]
  );
}

module.exports = { recordUsage, getAgentUsageSummary, getAgentUsageHistory };
