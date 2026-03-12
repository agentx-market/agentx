const db = require('../db');

const SITE_URL = 'https://agentx.market';
const CHANGELOG_PATH = '/changelog';
const CHANGELOG_XML_PATH = '/changelog.xml';

function slugifyAgentName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toRfc822Date(timestamp) {
  const safeTimestamp = Number(timestamp) || Date.now();
  return new Date(safeTimestamp).toUTCString();
}

function getRecentChangelogEntries(limit = 20) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
  const rows = db.all(`
    SELECT
      e.id,
      e.title,
      e.content,
      e.created_at,
      e.updated_at,
      e.agent_id,
      a.name AS agent_name,
      o.name AS operator_name
    FROM agent_changelog_entries e
    JOIN agents a ON a.id = e.agent_id
    LEFT JOIN operators o ON o.id = e.operator_id
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT ?
  `, [safeLimit]);

  return rows.map((row) => ({
    ...row,
    agent_slug: slugifyAgentName(row.agent_name),
    operator_display_name: row.operator_name || 'Operator',
    url: `${SITE_URL}/agents/${slugifyAgentName(row.agent_name)}`
  }));
}

function buildChangelogRssFeed(limit = 20) {
  const entries = getRecentChangelogEntries(limit);
  const lastUpdatedAt = entries.reduce(
    (latest, entry) => Math.max(latest, Number(entry.updated_at) || Number(entry.created_at) || 0),
    0
  ) || Date.now();

  const itemsXml = entries.map((entry) => `
    <item>
      <title>${escapeXml(entry.title)}</title>
      <link>${escapeXml(entry.url)}</link>
      <guid isPermaLink="false">${escapeXml(`${SITE_URL}/changelog#entry-${entry.id}`)}</guid>
      <description>${escapeXml(entry.content)}</description>
      <pubDate>${escapeXml(toRfc822Date(entry.created_at))}</pubDate>
      <category>${escapeXml(entry.agent_name)}</category>
    </item>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>AgentX Agent Changelog</title>
    <link>${escapeXml(`${SITE_URL}${CHANGELOG_PATH}`)}</link>
    <description>Recent operator-posted updates for agents on AgentX.</description>
    <atom:link href="${escapeXml(`${SITE_URL}${CHANGELOG_XML_PATH}`)}" rel="self" type="application/rss+xml" xmlns:atom="http://www.w3.org/2005/Atom" />
    <lastBuildDate>${escapeXml(toRfc822Date(lastUpdatedAt))}</lastBuildDate>
    <ttl>60</ttl>
    ${itemsXml}
  </channel>
</rss>`;
}

module.exports = {
  getRecentChangelogEntries,
  buildChangelogRssFeed
};
