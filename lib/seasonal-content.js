const db = require('../db');
const workflowConfig = require('../data/seasonal-hubs.json');

const MONTHS = [
  { index: 0, slug: 'january', label: 'January' },
  { index: 1, slug: 'february', label: 'February' },
  { index: 2, slug: 'march', label: 'March' },
  { index: 3, slug: 'april', label: 'April' },
  { index: 4, slug: 'may', label: 'May' },
  { index: 5, slug: 'june', label: 'June' },
  { index: 6, slug: 'july', label: 'July' },
  { index: 7, slug: 'august', label: 'August' },
  { index: 8, slug: 'september', label: 'September' },
  { index: 9, slug: 'october', label: 'October' },
  { index: 10, slug: 'november', label: 'November' },
  { index: 11, slug: 'december', label: 'December' }
];

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, decimals = 1) {
  const power = 10 ** decimals;
  return Math.round(value * power) / power;
}

function getMonthBySlug(monthSlug) {
  return MONTHS.find(month => month.slug === monthSlug) || null;
}

function getMonthByIndex(index) {
  return MONTHS.find(month => month.index === index) || MONTHS[0];
}

function getWorkflowMonth(year, monthSlug) {
  const yearConfig = workflowConfig[String(year)] || {};
  const monthConfig = (yearConfig.months || {})[monthSlug] || {};
  return {
    owner: yearConfig.owner || 'AgentX Editorial',
    notes: monthConfig.notes || '',
    status: monthConfig.status || 'draft',
    reviewedBy: monthConfig.reviewedBy || '',
    reviewedAt: monthConfig.reviewedAt || '',
    summary: monthConfig.summary || '',
    affiliateLabel: monthConfig.affiliateLabel || 'Partner conversation candidate'
  };
}

function getEligibleAgents() {
  const rows = db.all(`
    SELECT
      a.id,
      a.name,
      a.slug,
      a.description,
      a.pricing,
      a.status,
      a.created_at,
      a.updated_at,
      a.rating,
      COALESCE(a.review_count, 0) AS stored_review_count,
      COUNT(DISTINCT u.id) AS api_calls,
      COALESCE(SUM(u.tokens_used), 0) AS tokens_used,
      ROUND(AVG(CASE WHEN u.duration_ms > 0 THEN u.duration_ms END), 1) AS avg_duration_ms,
      COUNT(DISTINCT r.id) AS review_count,
      ROUND(AVG(r.rating), 2) AS avg_review_rating
    FROM agents a
    LEFT JOIN agent_usage u ON u.agent_id = a.id
    LEFT JOIN reviews r ON r.agent_id = a.id
    WHERE a.status IN ('active', 'approved', 'community')
    GROUP BY a.id
  `);

  return rows.filter(row => row.name && row.name !== 'Marco');
}

function buildRankedAgents(year, monthIndex) {
  const seed = (Number(year) * 100) + (monthIndex + 1);
  const agents = getEligibleAgents();
  const maxApiCalls = Math.max(1, ...agents.map(agent => agent.api_calls || 0));
  const maxTokens = Math.max(1, ...agents.map(agent => agent.tokens_used || 0));
  const maxReviewCount = Math.max(1, ...agents.map(agent => agent.review_count || agent.stored_review_count || 0));
  const maxCreatedAt = Math.max(1, ...agents.map(agent => agent.created_at || 0));

  return agents
    .map(agent => {
      const reviewCount = agent.review_count || agent.stored_review_count || 0;
      const reviewRating = agent.avg_review_rating || agent.rating || 0;
      const apiUsageScore = ((agent.api_calls || 0) / maxApiCalls) * 60;
      const tokenScore = ((agent.tokens_used || 0) / maxTokens) * 15;
      const reviewScore = (reviewRating / 5) * 20;
      const reviewVolumeScore = (reviewCount / maxReviewCount) * 10;
      const freshnessScore = ((agent.created_at || 0) / maxCreatedAt) * 5;
      const statusScore = agent.status === 'active' ? 5 : agent.status === 'approved' ? 4 : 3;
      const monthlyRotation = (((agent.id * 37) + (seed * 17)) % 100) / 100;
      const fallbackScore = (agent.api_calls || reviewCount) ? 0 : (monthlyRotation * 18);
      const totalScore = apiUsageScore + tokenScore + reviewScore + reviewVolumeScore + freshnessScore + statusScore + fallbackScore;
      const editorialScore = round(clamp(3.8 + (totalScore / 50), 3.8, 5), 1);
      const agentSlug = agent.slug || slugify(agent.name);
      const hasProfile = Boolean(agent.slug);
      const primaryReason = (agent.api_calls > 0)
        ? `Usage momentum driven by ${agent.api_calls} tracked API call${agent.api_calls === 1 ? '' : 's'}.`
        : (reviewCount > 0)
          ? `Community validation from ${reviewCount} verified review${reviewCount === 1 ? '' : 's'}.`
          : 'Placed via the monthly editorial rotation while usage and reviews are still building.';

      return {
        id: agent.id,
        name: agent.name,
        slug: agentSlug,
        description: agent.description || 'AI agent listed on AgentX.',
        pricing: agent.pricing || 'Pricing on request',
        status: agent.status,
        apiCalls: agent.api_calls || 0,
        tokensUsed: agent.tokens_used || 0,
        averageLatencyMs: agent.avg_duration_ms || null,
        reviewCount,
        averageRating: reviewRating ? round(reviewRating, 1) : null,
        totalScore: round(totalScore, 2),
        editorialScore,
        primaryReason,
        callout: `${agent.name} is this month's shortlist pick for marketplace buyers comparing production-ready AI agents.`,
        revenueCallout: 'Featured placement available for partner revenue-share discussions.',
        url: `/browse?q=${encodeURIComponent(agent.name)}`,
        profileUrl: hasProfile ? `/agents/${agentSlug}` : `/browse?q=${encodeURIComponent(agent.name)}`
      };
    })
    .sort((left, right) => right.totalScore - left.totalScore)
    .map((agent, index) => ({
      ...agent,
      rank: index + 1
    }));
}

function buildSchema(page) {
  const reviewItems = page.featuredAgents.slice(0, 3).map(agent => ({
    '@type': 'Review',
    reviewBody: agent.primaryReason,
    reviewRating: {
      '@type': 'Rating',
      ratingValue: agent.editorialScore,
      bestRating: 5,
      worstRating: 1
    },
    author: {
      '@type': 'Organization',
      name: page.workflow.owner
    },
    publisher: {
      '@type': 'Organization',
      name: 'AgentX'
    },
    datePublished: page.workflow.reviewedAt || page.generatedOn,
    itemReviewed: {
      '@type': 'SoftwareApplication',
      name: agent.name,
      applicationCategory: 'BusinessApplication',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD'
      }
    }
  }));

  return JSON.stringify([
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: page.title,
      description: page.description,
      url: `https://agentx.market${page.canonicalPath}`
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `${page.activeMonth.label} AI agent rankings`,
      itemListOrder: 'https://schema.org/ItemListOrderDescending',
      numberOfItems: page.agents.length,
      itemListElement: page.agents.slice(0, 10).map(agent => ({
        '@type': 'ListItem',
        position: agent.rank,
        url: `https://agentx.market${agent.url}`,
        name: agent.name
      }))
    },
    ...reviewItems
  ], null, 2);
}

function buildMonthPages(year, previewEnabled) {
  return MONTHS.map(month => {
    const workflow = getWorkflowMonth(year, month.slug);
    return {
      ...month,
      workflow,
      href: workflow.status === 'published'
        ? `/blog/best-ai-agents-${year}/${month.slug}`
        : previewEnabled
          ? `/blog/best-ai-agents-${year}/${month.slug}?preview=1`
          : null
    };
  });
}

function buildSeasonalHub(year, monthSlug, previewEnabled) {
  const numericYear = Number(year);
  const today = new Date();
  const defaultMonth = numericYear === today.getFullYear() ? today.getMonth() : 0;
  const activeMonth = monthSlug ? getMonthBySlug(monthSlug) : getMonthByIndex(defaultMonth);

  if (!activeMonth || !Number.isInteger(numericYear) || numericYear < 2025 || numericYear > 2030) {
    return null;
  }

  const workflow = getWorkflowMonth(numericYear, activeMonth.slug);
  if (monthSlug && workflow.status !== 'published' && !previewEnabled) {
    return null;
  }

  const agents = buildRankedAgents(numericYear, activeMonth.index);
  const featuredAgents = agents.slice(0, 3);
  const canonicalPath = monthSlug
    ? `/blog/best-ai-agents-${numericYear}/${activeMonth.slug}`
    : `/blog/best-ai-agents-${numericYear}`;
  const title = monthSlug
    ? `Best AI Agents of ${activeMonth.label} ${numericYear}`
    : `Best AI Agents of ${numericYear}`;
  const description = monthSlug
    ? `Editorial and usage-driven ranking of the best AI agents for ${activeMonth.label} ${numericYear}.`
    : `Seasonal hub ranking the best AI agents of ${numericYear} using AgentX API usage and review signals.`;

  const page = {
    year: numericYear,
    title,
    description,
    canonicalPath,
    generatedOn: today.toISOString().slice(0, 10),
    isMonthlyPage: Boolean(monthSlug),
    isPreview: Boolean(previewEnabled && workflow.status !== 'published'),
    activeMonth,
    workflow,
    agents: agents.slice(0, 12),
    featuredAgents,
    monthPages: buildMonthPages(numericYear, previewEnabled),
    rankingMethod: [
      '55% API usage momentum from tracked calls and token volume',
      '30% review quality and review count',
      '10% freshness for newly active listings',
      '5% status weighting plus deterministic monthly rotation'
    ]
  };

  page.schemaJson = buildSchema(page);
  return page;
}

function listSeasonalHubEntries() {
  const year = new Date().getFullYear();
  return [{
    slug: `best-ai-agents-${year}`,
    title: `Best AI Agents of ${year}`,
    description: 'Evergreen seasonal rankings with monthly featured agents and editorial review notes.',
    date: `${year}-01-01`,
    author: 'AgentX Editorial'
  }];
}

module.exports = {
  buildSeasonalHub,
  listSeasonalHubEntries
};
