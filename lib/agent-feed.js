const db = require('../db');

const SITE_URL = 'https://agentx.market';
const FEED_PATH_JSON = '/agents/feed.json';
const FEED_PATH_XML = '/agents/feed.xml';

function slugifyAgentName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toIsoDate(timestamp) {
  const safeTimestamp = Number(timestamp) || Date.now();
  return new Date(safeTimestamp).toISOString();
}

function toRfc822Date(timestamp) {
  const safeTimestamp = Number(timestamp) || Date.now();
  return new Date(safeTimestamp).toUTCString();
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeCapabilities(rawCapabilities) {
  if (!rawCapabilities) return [];

  if (Array.isArray(rawCapabilities)) {
    return rawCapabilities.filter(Boolean).map(String);
  }

  try {
    const parsed = JSON.parse(rawCapabilities);
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
  } catch (error) {
    return [];
  }
}

function getRecentAgentRows(limit = 50) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 50));

  return db.all(`
    SELECT
      a.id,
      a.name,
      a.description,
      a.capabilities,
      a.endpoint_url,
      a.pricing,
      a.status,
      a.created_at,
      a.updated_at,
      a.operator_id,
      a.community_listing,
      a.featured,
      a.featured_until,
      a.rating,
      a.review_count,
      a.uptime_percent,
      GROUP_CONCAT(DISTINCT c.name) AS category_tags
    FROM agents a
    LEFT JOIN agent_categories ac ON ac.agent_id = a.id
    LEFT JOIN categories c ON c.id = ac.category_id
    WHERE a.operator_id IS NOT NULL
       OR IFNULL(a.community_listing, 0) = 1
    GROUP BY a.id
    ORDER BY COALESCE(a.updated_at, a.created_at) DESC, a.created_at DESC
    LIMIT ?
  `, [safeLimit]);
}

function mapAgentToFeedItem(agent, position) {
  const slug = slugifyAgentName(agent.name);
  const createdAt = Number(agent.created_at) || Date.now();
  const updatedAt = Number(agent.updated_at) || createdAt;
  const categoryTags = agent.category_tags
    ? agent.category_tags.split(',').map((tag) => tag.trim()).filter(Boolean)
    : [];
  const capabilities = normalizeCapabilities(agent.capabilities);
  const keywords = [...new Set([...categoryTags, ...capabilities])];
  const url = `${SITE_URL}/agents/${slug}`;
  const listingType = agent.operator_id ? 'marketplace' : 'community';

  return {
    id: agent.id,
    slug,
    position,
    url,
    listingType,
    name: agent.name,
    description: agent.description || 'AI agent listed on AgentX.',
    categoryTags,
    capabilities,
    createdAt,
    updatedAt,
    schema: {
      '@type': 'SoftwareApplication',
      name: agent.name,
      description: agent.description || 'AI agent listed on AgentX.',
      url,
      applicationCategory: categoryTags[0] || 'AI Agent',
      keywords: keywords.join(', '),
      operatingSystem: 'Any',
      softwareHelp: `${SITE_URL}/docs`,
      datePublished: toIsoDate(createdAt),
      dateModified: toIsoDate(updatedAt),
      offers: agent.pricing ? {
        '@type': 'Offer',
        priceCurrency: 'USD',
        description: agent.pricing
      } : undefined,
      aggregateRating: agent.review_count ? {
        '@type': 'AggregateRating',
        ratingValue: Number(Number(agent.rating || 0).toFixed(1)),
        reviewCount: Number(agent.review_count || 0)
      } : undefined
    }
  };
}

function buildAgentFeed(limit = 50) {
  const rows = getRecentAgentRows(limit);
  const items = rows.map((row, index) => mapAgentToFeedItem(row, index + 1));
  const lastUpdatedAt = items.reduce((latest, item) => Math.max(latest, item.updatedAt), 0) || Date.now();

  return {
    siteUrl: SITE_URL,
    jsonUrl: `${SITE_URL}${FEED_PATH_JSON}`,
    xmlUrl: `${SITE_URL}${FEED_PATH_XML}`,
    lastUpdatedAt,
    lastUpdatedIso: toIsoDate(lastUpdatedAt),
    items
  };
}

function buildJsonFeed(limit = 50) {
  const feed = buildAgentFeed(limit);

  return {
    '@context': 'https://schema.org',
    '@type': 'DataFeed',
    name: 'AgentX AI Agent Directory Feed',
    description: 'Structured feed of the latest AI agent listings published on AgentX.',
    url: feed.jsonUrl,
    dateModified: feed.lastUpdatedIso,
    numberOfItems: feed.items.length,
    provider: {
      '@type': 'Organization',
      name: 'AgentX',
      url: feed.siteUrl
    },
    itemListElement: feed.items.map((item) => ({
      '@type': 'ListItem',
      position: item.position,
      item: item.schema
    })),
    items: feed.items.map((item) => ({
      id: item.id,
      slug: item.slug,
      url: item.url,
      listingType: item.listingType,
      name: item.name,
      description: item.description,
      categoryTags: item.categoryTags,
      capabilities: item.capabilities,
      datePublished: toIsoDate(item.createdAt),
      dateModified: toIsoDate(item.updatedAt),
      schema: item.schema
    }))
  };
}

function buildRssFeed(limit = 50) {
  const feed = buildAgentFeed(limit);
  const itemsXml = feed.items.map((item) => {
    const categoriesXml = item.categoryTags
      .map((tag) => `<category>${escapeXml(tag)}</category>`)
      .join('');

    return `
    <item>
      <title>${escapeXml(item.name)}</title>
      <link>${escapeXml(item.url)}</link>
      <guid isPermaLink="true">${escapeXml(item.url)}</guid>
      <description>${escapeXml(item.description)}</description>
      <pubDate>${escapeXml(toRfc822Date(item.updatedAt))}</pubDate>
      ${categoriesXml}
    </item>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>AgentX AI Agent Directory Feed</title>
    <link>${escapeXml(feed.siteUrl)}</link>
    <description>Latest AI agent listings from AgentX.</description>
    <lastBuildDate>${escapeXml(toRfc822Date(feed.lastUpdatedAt))}</lastBuildDate>
    <ttl>60</ttl>
    ${itemsXml}
  </channel>
</rss>`;
}

module.exports = {
  buildJsonFeed,
  buildRssFeed
};
