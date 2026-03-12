const db = require('../db');
const abuseLimits = require('../config/abuse-limits');
const lwWallet = require('./lw-wallet');

async function verifyOperatorEligibility(operatorId) {
  const operator = db.get('SELECT * FROM operators WHERE id = ?', [operatorId]);
  if (!operator) return { eligible: false, reason: 'Operator not found' };

  // Check registration rate limit
  const windowStart = Date.now() - abuseLimits.registrationRateLimitWindowMs;
  const lastHour = db.get(
    'SELECT COUNT(*) as count FROM agents WHERE operator_id = ? AND created_at >= ?',
    [operatorId, windowStart]
  );

  if (lastHour.count >= abuseLimits.registration.maxAgentsPerHourPerOperator) {
    return { eligible: false, reason: 'Rate limit exceeded (1 agent/hour)' };
  }

  // Check free tier limit
  const agentCount = db.get(
    'SELECT COUNT(*) as count FROM agents WHERE operator_id = ?',
    [operatorId]
  );

  if (agentCount.count >= abuseLimits.freetier.maxAgentsPerOperator) {
    return { eligible: false, reason: 'Free tier limit reached (5 agents max)' };
  }

  return { eligible: true, reason: null };
}

async function verifyWelcomeBonusEligibility(operatorId, agentId) {
  const operator = db.get('SELECT * FROM operators WHERE id = ?', [operatorId]);
  if (!operator) return { eligible: false, reason: 'Operator not found' };

  if (operator.github_id && operator.github_account_created_at) {
    const minAgeMs = abuseLimits.bonus.minAccountAgeDays * 24 * 60 * 60 * 1000;
    if ((Date.now() - operator.github_account_created_at) < minAgeMs) {
      return { eligible: false, reason: `GitHub account must be at least ${abuseLimits.bonus.minAccountAgeDays} days old` };
    }
  }

  if (operator.welcome_bonus_claimed_at) {
    return { eligible: false, reason: 'Bonus already claimed' };
  }

  const existingBonus = db.get(
    'SELECT COUNT(*) as count FROM welcome_bonuses WHERE operator_id = ? AND claimed = 1',
    [operatorId]
  );
  if ((existingBonus?.count || 0) > 0) {
    return { eligible: false, reason: 'Bonus already claimed' };
  }

  const otherHealthyAgents = db.get(
    'SELECT COUNT(*) as count FROM agents WHERE operator_id = ? AND id != ? AND health_check_passed_at IS NOT NULL',
    [operatorId, agentId]
  );
  if ((otherHealthyAgents?.count || 0) > 0) {
    return { eligible: false, reason: 'Bonus already awarded after a prior healthy agent registration' };
  }

  return { eligible: true, reason: null, operator };
}

async function awardWelcomeBonus(operatorId, agentId) {
  const eligibility = await verifyWelcomeBonusEligibility(operatorId, agentId);
  if (!eligibility.eligible) {
    return { sent: false, reason: eligibility.reason };
  }

  const now = Date.now();
  let walletId = eligibility.operator.wallet_id;

  if (!walletId) {
    const walletLabel = eligibility.operator.name || operatorId;
    walletId = lwWallet.registerOperatorWallet(walletLabel);
    db.run('UPDATE operators SET wallet_id = ?, updated_at = ? WHERE id = ?', [walletId, now, operatorId]);
  }

  lwWallet.sendWelcomeBonus(walletId, lwWallet.WELCOME_BONUS_SATS, 'welcome bonus');
  db.run(
    'UPDATE operators SET welcome_bonus_claimed_at = ?, wallet_funded_at = ?, updated_at = ? WHERE id = ?',
    [now, now, now, operatorId]
  );
  db.run(
    'INSERT INTO welcome_bonuses (operator_id, agent_id, claimed, amount_sats, created_at) VALUES (?, ?, 1, ?, datetime("now"))',
    [operatorId, agentId, lwWallet.WELCOME_BONUS_SATS]
  );

  return {
    sent: true,
    amountSats: lwWallet.WELCOME_BONUS_SATS,
    walletId,
  };
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

module.exports = {
  verifyOperatorEligibility,
  verifyWelcomeBonusEligibility,
  verifyAgentHealthBeforeBonus,
  awardWelcomeBonus,
};
