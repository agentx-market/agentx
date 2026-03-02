const db = require('../db');

async function trackOperatorIp(operatorId, ipAddress) {
  // Insert IP record
  await db.run(
    'INSERT INTO operator_ip_log (operator_id, ip_address, created_at) VALUES (?, ?, datetime("now"))',
    [operatorId, ipAddress]
  );

  // Count unique operators from this IP in last 24h
  const result = await db.get(
    'SELECT COUNT(DISTINCT operator_id) as count FROM operator_ip_log WHERE ip_address = ? AND created_at > datetime("now", "-1 day")',
    [ipAddress]
  );

  return result?.count || 0;
}

async function checkIpThreshold(ipAddress) {
  const abuseLimits = require('../config/abuse-limits');
  const threshold = abuseLimits.ipTracking.alertThreshold;

  const result = await db.get(
    'SELECT COUNT(DISTINCT operator_id) as count FROM operator_ip_log WHERE ip_address = ? AND created_at > datetime("now", "-1 day")',
    [ipAddress]
  );

  const count = result?.count || 0;
  if (count >= threshold) {
    return { exceeded: true, count, threshold };
  }
  return { exceeded: false, count, threshold };
}

async function alertMarcoIpAbuse(ipAddress, operatorCount) {
  // Send alert via email/Telegram
  const message = `⚠️ Abuse Alert: IP ${ipAddress} created ${operatorCount} operators in 24h`;
  console.error(message);
  
  // Log to database for review
  await db.run(
    'INSERT INTO abuse_alerts (type, details, created_at) VALUES (?, ?, datetime("now"))',
    ['ip_threshold', JSON.stringify({ ipAddress, operatorCount })]
  );
}

module.exports = { trackOperatorIp, checkIpThreshold, alertMarcoIpAbuse };
