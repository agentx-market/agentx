const HEALTH_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const HEALTH_CHECK_FRESHNESS_MS = 2 * HEALTH_CHECK_INTERVAL_MS;

function parseHealthTimestamp(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const numericValue = Number(value);
  if (Number.isFinite(numericValue) && String(value).trim() !== '') {
    return numericValue;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getLastHealthCheckAt(agent) {
  return parseHealthTimestamp(agent?.last_health_check) ?? parseHealthTimestamp(agent?.health_check_passed_at);
}

function getEffectiveHealthStatus(agent, now = Date.now()) {
  const baseStatus = agent?.health_status || null;
  const lastCheckedAt = getLastHealthCheckAt(agent);
  const ageMs = lastCheckedAt === null ? null : Math.max(0, now - lastCheckedAt);

  if (baseStatus === 'offline') {
    return 'offline';
  }

  if (ageMs === null) {
    return agent?.status === 'active' ? 'degraded' : 'offline';
  }

  if (ageMs > HEALTH_CHECK_FRESHNESS_MS) {
    return 'degraded';
  }

  if (baseStatus === 'degraded') {
    return 'degraded';
  }

  if (baseStatus === 'online' || parseHealthTimestamp(agent?.health_check_passed_at) !== null) {
    return 'online';
  }

  return agent?.status === 'active' ? 'degraded' : 'offline';
}

function getHealthBadgeMeta(agent, now = Date.now()) {
  const status = getEffectiveHealthStatus(agent, now);
  const lastCheckedAt = getLastHealthCheckAt(agent);

  if (status === 'online') {
    return {
      status,
      tone: 'green',
      label: 'Healthy',
      detailLabel: 'Healthy monitor',
      shortLabel: 'Healthy',
      lastCheckedAt,
    };
  }

  if (status === 'degraded') {
    return {
      status,
      tone: 'yellow',
      label: 'Degraded',
      detailLabel: 'Degraded monitor',
      shortLabel: 'Degraded',
      lastCheckedAt,
    };
  }

  return {
    status: 'offline',
    tone: 'red',
    label: 'Offline',
    detailLabel: 'Offline monitor',
    shortLabel: 'Offline',
    lastCheckedAt,
  };
}

module.exports = {
  HEALTH_CHECK_INTERVAL_MS,
  HEALTH_CHECK_FRESHNESS_MS,
  getEffectiveHealthStatus,
  getHealthBadgeMeta,
  getLastHealthCheckAt,
  parseHealthTimestamp,
};
