const { applyWeeklyRotation } = require('../lib/agent-of-week');

function runAgentOfWeekRotation() {
  const active = applyWeeklyRotation();
  if (active) {
    console.log(`[agent-of-week] Active schedule ${active.id} -> agent ${active.active_agent_id || active.selected_agent_id}`);
  } else {
    console.log('[agent-of-week] No active schedule for current week');
  }
  return active;
}

module.exports = { runAgentOfWeekRotation };
