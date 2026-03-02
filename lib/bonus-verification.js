const db = require('../db');
const abuseLimits = require('../config/abuse-limits');

async function verifyOperatorEligibility(operatorId) {
  const operator = await db.get('SELECT * FROM operators WHERE id = ?', [operatorId]);
  if (!operator) return { eligible: false, reason: 'Operator not found' };

  // Check account age (GitHub/OAuth)
  const createdAt = new Date(operator.created_at);
  const ageMs = Date.now() - createdAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  if (ageDays < abuseLimits.bonus.minAccountAgeDays) {
    return { eligible: false, reason: `Account too new (${ageDays.toFixed(1)} days)` };
  }

  // Check if already received bonus
  const existing = await db.get(
    'SELECT COUNT(*) as count FROM welcome_bonuses WHERE operator_id = ? AND claimed = 1',
    [operatorId]
  );

  if (existing.count > 0) {
    return { eligible: false, reason: 'Bonus already claimed' };
  }

  // Check registration rate limit
  const lastHour = await db.get(
    'SELECT COUNT(*) as count FROM agents WHERE operator_id = ? AND created_at > datetime("now", "-1 hour")',
    [operatorId]
  );

  if (lastHour.count >= abuseLimits.registration.maxAgentsPerHourPerOperator) {
    return { eligible: false, reason: 'Rate limit exceeded (1 agent/hour)' };
  }

  // Check free tier limit
  const agentCount = await db.get(
    'SELECT COUNT(*) as count FROM agents WHERE operator_id = ? AND tier = "free"',
    [operatorId]
  );

  if (agentCount.count >= abuseLimits.freetier.maxAgentsPerOperator) {
    return { eligible: false, reason: 'Free tier limit reached (5 agents max)' };
  }

  return { eligible: true, reason: null };
}

async function verifyAgentHealthBeforeBonus(agentId) {
  const health = await db.get(
    'SELECT * FROM health_checks WHERE agent_id = ? ORDER BY checked_at DESC LIMIT 1',
    [agentId]
  );

  if (!health || health.status !== 'healthy') {
    return { passed: false, reason: 'Agent has not passed health check' };
  }

  return { passed: true };
}

module.exports = { verifyOperatorEligibility, verifyAgentHealthBeforeBonus };
