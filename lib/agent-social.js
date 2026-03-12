const crypto = require('crypto');
const db = require('../db');
const { getAgentBySlug } = require('./agent-queries');

function getListingType(agent) {
  return agent.operator_id ? 'marketplace' : (agent.community_listing ? 'community' : 'seeded');
}

function getAgentApiCalls(agent) {
  if (agent.liveMetrics && agent.liveMetrics.available) {
    return Number(agent.liveMetrics.completedTasks || 0);
  }

  const usage = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN tasks_completed > 0 THEN tasks_completed ELSE 1 END), 0) AS api_calls
    FROM agent_usage
    WHERE agent_id = ?
  `).get(agent.id);

  return Number(usage && usage.api_calls ? usage.api_calls : 0);
}

function getAgentShareStats(agent) {
  const apiCalls = getAgentApiCalls(agent);
  const uptime = agent.liveMetrics && agent.liveMetrics.available && agent.liveMetrics.uptime7d !== null
    ? Number(agent.liveMetrics.uptime7d)
    : (agent.uptime_percent !== null && agent.uptime_percent !== undefined ? Number(agent.uptime_percent) : null);
  const rating = agent.rating !== null && agent.rating !== undefined ? Number(agent.rating) : null;
  const reviewCount = Number(agent.review_count || 0);

  return {
    apiCalls,
    uptime,
    rating,
    reviewCount,
  };
}

function getAgentSocialContext(slug) {
  const agent = getAgentBySlug(slug);
  if (!agent) return null;

  const listingType = getListingType(agent);
  if (listingType === 'seeded') return null;

  return {
    agent,
    listingType,
    shareStats: getAgentShareStats(agent),
  };
}

function getOgImageVersion(agent, shareStats) {
  return crypto.createHash('sha1').update(JSON.stringify({
    id: agent.id,
    updatedAt: agent.updated_at || null,
    health: agent.health_check_passed_at || null,
    liveSnapshot: agent.liveMetrics ? agent.liveMetrics.lastSnapshotAt : null,
    rating: shareStats.rating,
    reviews: shareStats.reviewCount,
    uptime: shareStats.uptime,
    apiCalls: shareStats.apiCalls,
  })).digest('hex').slice(0, 12);
}

function getAttributionFromRequest(req) {
  const source = req.query.utm_source ? String(req.query.utm_source).slice(0, 100) : null;
  const medium = req.query.utm_medium ? String(req.query.utm_medium).slice(0, 100) : null;
  const campaign = req.query.utm_campaign ? String(req.query.utm_campaign).slice(0, 100) : null;
  const content = req.query.utm_content ? String(req.query.utm_content).slice(0, 200) : null;

  return { source, medium, campaign, content };
}

function buildAgentTweetText(agent, shareStats) {
  const parts = [];

  if (shareStats.apiCalls > 0) {
    parts.push(`${shareStats.apiCalls.toLocaleString()} API calls`);
  }
  if (shareStats.uptime !== null) {
    parts.push(`${shareStats.uptime.toFixed(1)}% uptime`);
  }
  if (shareStats.rating !== null) {
    parts.push(`${shareStats.rating.toFixed(1)}/5 rating`);
  }

  const summary = parts.length > 0 ? parts.join(' • ') : 'Live operator stats on AgentX';
  return `Check out ${agent.name} on AgentX: ${summary}`;
}

module.exports = {
  buildAgentTweetText,
  getAgentSocialContext,
  getAttributionFromRequest,
  getListingType,
  getOgImageVersion,
};
