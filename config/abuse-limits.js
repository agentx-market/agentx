/**
 * Abuse Prevention Configuration
 * 
 * All limits are tunable for production adjustments.
 * Located here for easy modification without code changes.
 */

module.exports = {
  // Welcome bonus rules
  bonus: {
    maxPerOperator: 1,              // One bonus per verified operator
    minAccountAgeDays: 7,           // GitHub/OAuth account must be >7 days old
    requireHealthCheckBeforeBonus: true, // Agent must pass health check first
  },

  // Tier-based constraints
  freetier: {
    maxAgentsPerOperator: 5,        // Max agents per operator on free tier
  },

  // Rate limiting
  registration: {
    maxAgentsPerHourPerOperator: 1, // Max 1 new agent registration per hour
  },

  // IP tracking & abuse alerts
  ipTracking: {
    maxOperatorsPerIp: 3,           // Alert if 1 IP creates >3 operators
    alertThreshold: 3,              // Trigger alert at this count
  },

  // Feature flags
  enabled: {
    bonusVerification: true,
    ipTracking: true,
    accountAgeCheck: true,
  },

  // Legacy config (for backward compatibility)
  welcomeBonusPerOperator: 1,
  minGitHubAccountAgeDays: 7,
  maxAgentsPerOperatorFreeTier: 5,
  registrationRateLimitPerHour: 1,
  registrationRateLimitWindowMs: 60 * 60 * 1000,
  ipAlertThreshold: 3,
  ipTrackingEnabled: true,
  requireHealthCheck: true,
  healthCheckWindowHours: 24,
  healthCheckWindowMs: 24 * 60 * 60 * 1000,
  alertEmail: 'support@agentx.market',
  alertTelegramEnabled: false,
};
