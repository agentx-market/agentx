// AgentX.Market — Configuration
// All tunable limits and settings stored here for easy adjustment

const path = require('path');

module.exports = {
  // Abuse prevention limits (tunable)
  abuse: {
    // Welcome bonus settings
    welcomeBonusSats: 21,
    maxAgentsPerOperatorFree: 5,
    maxRegistrationsPerHour: 1,
    minGitHubAccountAgeDays: 7,
    
    // IP-based abuse detection
    maxOperatorsPerIP: 3,  // Alert Marco if exceeded
    ipCheckEnabled: true,
    
    // Rate limiting
    healthCheckRequiredBeforeBonus: true,
    healthCheckTimeoutMs: 5000,
    healthCheckInterval: 3600000,  // 1 hour between health checks
  },
  
  // Server settings
  port: process.env.MARCO_WEB_PORT || 3000,
  
  // Telegram notifications
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
    enabled: !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_CHAT_ID,
  },
  
  // Lightning wallet (Marco's lw commands)
  lightning: {
    enabled: true,  // Set to false during testing
  },
  
  // Paths
  dbPath: process.env.AGENTX_DB_PATH || path.join(__dirname, 'agentx.db'),
  submissionsDir: path.join(__dirname, 'submissions'),
  webhooksDir: path.join(__dirname, 'webhooks'),
  publicDir: path.join(__dirname, 'public'),
  
  // URLs
  baseUrl: process.env.BASE_URL || 'https://agentx.market',
  healthCheckUrl: 'https://agentx.market/health',
};
