const db = require('../db');

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const HERO_ATTRIBUTION = {
  source: 'homepage',
  medium: 'featured',
  campaign: 'agent_of_the_week',
  content: 'hero',
};

function getWeekStart(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const utcDay = date.getUTCDay();
  const daysSinceMonday = (utcDay + 6) % 7;
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date.getTime();
}

function getWeekWindow(timestamp = Date.now()) {
  const weekStart = getWeekStart(timestamp);
  return {
    weekStart,
    weekEnd: weekStart + WEEK_MS,
  };
}

function safePercent(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function safeDelta(current, previous) {
  if (!previous) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function normalizeAgent(row) {
  if (!row) return null;

  return {
    id: row.agent_id,
    name: row.name,
    slug: row.slug,
    description: row.description || 'Featured on AgentX this week.',
    uptimePercent: row.uptime_percent === null || row.uptime_percent === undefined
      ? null
      : Number(row.uptime_percent),
    status: row.status || 'pending',
  };
}

function getCurrentSchedule(now = Date.now()) {
  return db.prepare(`
    SELECT
      s.*,
      COALESCE(s.active_agent_id, s.selected_agent_id) AS resolved_agent_id,
      selected.name AS selected_agent_name,
      active.name AS active_agent_name
    FROM featured_editorial_schedule s
    LEFT JOIN agents selected ON selected.id = s.selected_agent_id
    LEFT JOIN agents active ON active.id = s.active_agent_id
    WHERE s.week_start <= ?
      AND s.week_end > ?
    ORDER BY s.week_start DESC
    LIMIT 1
  `).get(now, now) || null;
}

function getScheduleRows(limit = 8) {
  return db.prepare(`
    SELECT
      s.*,
      selected.name AS selected_agent_name,
      active.name AS active_agent_name
    FROM featured_editorial_schedule s
    LEFT JOIN agents selected ON selected.id = s.selected_agent_id
    LEFT JOIN agents active ON active.id = s.active_agent_id
    ORDER BY s.week_start DESC
    LIMIT ?
  `).all(limit);
}

function upsertWeeklySelection({ agentId, weekStart, actorOperatorId = null, now = Date.now() }) {
  const selectedAgent = db.prepare(`
    SELECT id, name
    FROM agents
    WHERE id = ?
      AND operator_id IS NOT NULL
  `).get(agentId);

  if (!selectedAgent) {
    return null;
  }

  const normalizedWeekStart = getWeekStart(weekStart || now);
  const weekEnd = normalizedWeekStart + WEEK_MS;
  const existing = db.prepare(
    'SELECT id, emergency_override FROM featured_editorial_schedule WHERE week_start = ?'
  ).get(normalizedWeekStart);

  if (existing) {
    db.prepare(`
      UPDATE featured_editorial_schedule
      SET selected_agent_id = ?,
          active_agent_id = CASE WHEN emergency_override = 1 THEN active_agent_id ELSE ? END,
          status = CASE WHEN status = 'completed' THEN 'scheduled' ELSE status END,
          activated_by_operator_id = COALESCE(activated_by_operator_id, ?),
          updated_at = ?
      WHERE id = ?
    `).run(agentId, agentId, actorOperatorId, now, existing.id);
  } else {
    db.prepare(`
      INSERT INTO featured_editorial_schedule (
        week_start,
        week_end,
        selected_agent_id,
        active_agent_id,
        status,
        emergency_override,
        activated_at,
        activated_by_operator_id,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, 'scheduled', 0, NULL, ?, ?, ?)
    `).run(normalizedWeekStart, weekEnd, agentId, agentId, actorOperatorId, now, now);
  }

  return getCurrentOrUpcomingSchedule(normalizedWeekStart);
}

function getCurrentOrUpcomingSchedule(weekStart) {
  return db.prepare(`
    SELECT
      s.*,
      selected.name AS selected_agent_name,
      active.name AS active_agent_name
    FROM featured_editorial_schedule s
    LEFT JOIN agents selected ON selected.id = s.selected_agent_id
    LEFT JOIN agents active ON active.id = s.active_agent_id
    WHERE s.week_start = ?
    LIMIT 1
  `).get(weekStart) || null;
}

function applyWeeklyRotation({ now = Date.now() } = {}) {
  const currentWindow = getWeekWindow(now);
  const current = getCurrentSchedule(now);

  db.prepare(`
    UPDATE featured_editorial_schedule
    SET status = 'completed',
        updated_at = ?
    WHERE week_end <= ?
      AND status != 'completed'
  `).run(now, now);

  if (current) {
    const targetAgentId = current.emergency_override ? current.active_agent_id : current.selected_agent_id;
    db.prepare(`
      UPDATE featured_editorial_schedule
      SET active_agent_id = ?,
          status = 'active',
          activated_at = COALESCE(activated_at, ?),
          updated_at = ?
      WHERE id = ?
    `).run(targetAgentId, now, now, current.id);

    return getCurrentSchedule(now);
  }

  const scheduled = db.prepare(`
    SELECT id, selected_agent_id
    FROM featured_editorial_schedule
    WHERE week_start = ?
    LIMIT 1
  `).get(currentWindow.weekStart);

  if (!scheduled) {
    return null;
  }

  db.prepare(`
    UPDATE featured_editorial_schedule
    SET active_agent_id = selected_agent_id,
        status = 'active',
        emergency_override = 0,
        emergency_note = NULL,
        activated_at = COALESCE(activated_at, ?),
        updated_at = ?
    WHERE id = ?
  `).run(now, now, scheduled.id);

  return getCurrentSchedule(now);
}

function setEmergencyReplacement({
  scheduleId,
  replacementAgentId,
  actorOperatorId = null,
  emergencyNote = null,
  now = Date.now(),
}) {
  const schedule = db.prepare(`
    SELECT *
    FROM featured_editorial_schedule
    WHERE id = ?
  `).get(scheduleId);

  if (!schedule) {
    return null;
  }

  const selectedAgentId = replacementAgentId ? Number(replacementAgentId) : schedule.selected_agent_id;
  const replacement = db.prepare(`
    SELECT id
    FROM agents
    WHERE id = ?
      AND operator_id IS NOT NULL
  `).get(selectedAgentId);

  if (!replacement) {
    return null;
  }

  const overrideEnabled = Number(replacement.id) !== Number(schedule.selected_agent_id);

  db.prepare(`
    UPDATE featured_editorial_schedule
    SET active_agent_id = ?,
        status = 'active',
        emergency_override = ?,
        emergency_note = ?,
        activated_at = ?,
        activated_by_operator_id = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    replacement.id,
    overrideEnabled ? 1 : 0,
    overrideEnabled ? String(emergencyNote || '').trim().slice(0, 240) || null : null,
    now,
    actorOperatorId,
    now,
    scheduleId
  );

  return getCurrentOrUpcomingSchedule(schedule.week_start);
}

function getHeroAgent() {
  const schedule = applyWeeklyRotation();
  if (!schedule) return null;

  const row = db.prepare(`
    SELECT
      a.id AS agent_id,
      a.name,
      COALESCE(a.slug, LOWER(REPLACE(a.name, ' ', '-'))) AS slug,
      a.description,
      a.uptime_percent,
      a.status,
      s.id AS schedule_id,
      s.week_start,
      s.week_end,
      s.selected_agent_id,
      s.active_agent_id,
      s.emergency_override,
      s.emergency_note
    FROM featured_editorial_schedule s
    JOIN agents a
      ON a.id = COALESCE(s.active_agent_id, s.selected_agent_id)
    WHERE s.id = ?
    LIMIT 1
  `).get(schedule.id);

  if (!row) return null;

  const agent = normalizeAgent(row);
  return {
    scheduleId: row.schedule_id,
    weekStart: row.week_start,
    weekEnd: row.week_end,
    emergencyOverride: Boolean(row.emergency_override),
    emergencyNote: row.emergency_note || null,
    agent,
    attribution: HERO_ATTRIBUTION,
    href: `/agents/${row.slug}?utm_source=${encodeURIComponent(HERO_ATTRIBUTION.source)}&utm_medium=${encodeURIComponent(HERO_ATTRIBUTION.medium)}&utm_campaign=${encodeURIComponent(HERO_ATTRIBUTION.campaign)}&utm_content=${encodeURIComponent(HERO_ATTRIBUTION.content)}`,
  };
}

function getEditorialCandidates() {
  return db.prepare(`
    SELECT
      id,
      name,
      COALESCE(slug, LOWER(REPLACE(name, ' ', '-'))) AS slug,
      description,
      uptime_percent,
      status
    FROM agents
    WHERE operator_id IS NOT NULL
    ORDER BY
      CASE WHEN featured = 1 AND (featured_until IS NULL OR featured_until > ?) THEN 0 ELSE 1 END,
      COALESCE(uptime_percent, 0) DESC,
      created_at DESC,
      name COLLATE NOCASE ASC
  `).all(Date.now()).map(normalizeAgent);
}

function getImpactMetricsForSchedule(scheduleId) {
  const schedule = db.prepare(`
    SELECT
      s.*,
      selected.name AS selected_agent_name,
      active.name AS active_agent_name,
      COALESCE(s.active_agent_id, s.selected_agent_id) AS resolved_agent_id
    FROM featured_editorial_schedule s
    LEFT JOIN agents selected ON selected.id = s.selected_agent_id
    LEFT JOIN agents active ON active.id = s.active_agent_id
    WHERE s.id = ?
  `).get(scheduleId);

  if (!schedule) return null;

  const windowMs = Math.max(1, Number(schedule.week_end) - Number(schedule.week_start));
  const previousStart = Number(schedule.week_start) - windowMs;
  const previousEnd = Number(schedule.week_start);

  const currentStats = db.prepare(`
    SELECT
      SUM(CASE WHEN event_type = 'page_view' AND created_at >= datetime(? / 1000, 'unixepoch') AND created_at < datetime(? / 1000, 'unixepoch') THEN 1 ELSE 0 END) AS page_views,
      SUM(CASE WHEN event_type = 'featured_impression' AND attribution_campaign = 'agent_of_the_week' AND created_at >= datetime(? / 1000, 'unixepoch') AND created_at < datetime(? / 1000, 'unixepoch') THEN 1 ELSE 0 END) AS hero_impressions,
      SUM(CASE WHEN event_type = 'featured_click' AND attribution_campaign = 'agent_of_the_week' AND created_at >= datetime(? / 1000, 'unixepoch') AND created_at < datetime(? / 1000, 'unixepoch') THEN 1 ELSE 0 END) AS hero_clicks,
      SUM(CASE WHEN event_type = 'contact_conversion' AND attribution_campaign = 'agent_of_the_week' AND created_at >= datetime(? / 1000, 'unixepoch') AND created_at < datetime(? / 1000, 'unixepoch') THEN 1 ELSE 0 END) AS contact_conversions
    FROM analytics_events
    WHERE agent_id = ?
  `).get(
    schedule.week_start, schedule.week_end,
    schedule.week_start, schedule.week_end,
    schedule.week_start, schedule.week_end,
    schedule.week_start, schedule.week_end,
    schedule.resolved_agent_id
  );

  const previousStats = db.prepare(`
    SELECT
      SUM(CASE WHEN event_type = 'page_view' AND created_at >= datetime(? / 1000, 'unixepoch') AND created_at < datetime(? / 1000, 'unixepoch') THEN 1 ELSE 0 END) AS page_views,
      SUM(CASE WHEN event_type = 'contact_conversion' AND created_at >= datetime(? / 1000, 'unixepoch') AND created_at < datetime(? / 1000, 'unixepoch') THEN 1 ELSE 0 END) AS contact_conversions
    FROM analytics_events
    WHERE agent_id = ?
  `).get(previousStart, previousEnd, previousStart, previousEnd, schedule.resolved_agent_id);

  const currentViews = Number(currentStats.page_views || 0);
  const previousViews = Number(previousStats.page_views || 0);
  const heroImpressions = Number(currentStats.hero_impressions || 0);
  const heroClicks = Number(currentStats.hero_clicks || 0);
  const conversions = Number(currentStats.contact_conversions || 0);

  return {
    scheduleId: schedule.id,
    weekStart: schedule.week_start,
    weekEnd: schedule.week_end,
    selectedAgentName: schedule.selected_agent_name,
    activeAgentName: schedule.active_agent_name || schedule.selected_agent_name,
    emergencyOverride: Boolean(schedule.emergency_override),
    pageViews: currentViews,
    baselinePageViews: previousViews,
    trafficSpikePercent: safeDelta(currentViews, previousViews),
    heroImpressions,
    heroClicks,
    heroCtrPercent: safePercent(heroClicks, heroImpressions),
    conversions,
    conversionRatePercent: safePercent(conversions, heroClicks),
  };
}

function getEditorialDashboardData() {
  const scheduleRows = getScheduleRows(8);
  const rowsWithMetrics = scheduleRows.map((row) => ({
    ...row,
    impact: getImpactMetricsForSchedule(row.id),
  }));

  return {
    current: getHeroAgent(),
    candidates: getEditorialCandidates(),
    schedule: rowsWithMetrics,
  };
}

module.exports = {
  WEEK_MS,
  applyWeeklyRotation,
  getCurrentSchedule,
  getEditorialCandidates,
  getEditorialDashboardData,
  getHeroAgent,
  getImpactMetricsForSchedule,
  getWeekWindow,
  upsertWeeklySelection,
  setEmergencyReplacement,
};
