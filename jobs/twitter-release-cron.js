const db = require('../db');
const oauthConfig = require('../config/oauth');
const { postTweet, refreshTwitterToken } = require('../lib/twitter-client');

const SITE_URL = process.env.SITE_URL || 'https://agentx.market';

function isTwitterConfigured() {
  return Boolean(
    oauthConfig.twitter &&
    oauthConfig.twitter.clientID &&
    oauthConfig.twitter.clientSecret &&
    !String(oauthConfig.twitter.clientID).startsWith('YOUR_') &&
    !String(oauthConfig.twitter.clientSecret).startsWith('YOUR_')
  );
}

function extractVersionLabel(title, content) {
  const source = `${title || ''}\n${content || ''}`;
  const match = source.match(/\bv?\d+\.\d+(?:\.\d+)?(?:[-+][a-z0-9.-]+)?\b/i);
  if (match) return match[0].startsWith('v') ? match[0] : `v${match[0]}`;
  return 'new release';
}

function buildReleaseUrl(agentSlug) {
  return `${SITE_URL}/agents/${agentSlug}?utm_source=x&utm_medium=social&utm_campaign=agent_release`;
}

function buildTweetText(entry) {
  const versionLabel = extractVersionLabel(entry.title, entry.content);
  const link = buildReleaseUrl(entry.agent_slug);
  const headline = `${entry.agent_name} ${versionLabel} is live on AgentX.`;
  const summary = String(entry.title || '').trim();
  const availableForSummary = 280 - headline.length - link.length - 4;
  const clippedSummary = availableForSummary > 0
    ? summary.slice(0, availableForSummary).trim()
    : '';

  return {
    versionLabel,
    text: clippedSummary
      ? `${headline}\n${clippedSummary}\n${link}`
      : `${headline}\n${link}`,
    link,
  };
}

function storeHistory({ operatorId, agentId, changelogEntryId, versionLabel, postText, postUrl, externalPostId = null, status, errorMessage = null }) {
  const now = Date.now();
  db.prepare(`
    INSERT INTO social_post_history (
      operator_id,
      agent_id,
      provider,
      changelog_entry_id,
      version_label,
      post_text,
      post_url,
      external_post_id,
      status,
      error_message,
      created_at,
      updated_at
    ) VALUES (?, ?, 'twitter', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    operatorId,
    agentId,
    changelogEntryId,
    versionLabel,
    postText,
    postUrl,
    externalPostId,
    status,
    errorMessage,
    now,
    now
  );
}

function upsertConnectionTokens(connectionId, tokenPayload) {
  const expiresAt = tokenPayload.expires_in ? Date.now() + (Number(tokenPayload.expires_in) * 1000) : null;
  db.prepare(`
    UPDATE operator_social_connections
    SET access_token = ?,
        refresh_token = COALESCE(?, refresh_token),
        token_expires_at = ?,
        updated_at = ?,
        last_error = NULL
    WHERE id = ?
  `).run(
    tokenPayload.access_token,
    tokenPayload.refresh_token || null,
    expiresAt,
    Date.now(),
    connectionId
  );
}

async function getUsableAccessToken(connection) {
  const expiresAt = Number(connection.token_expires_at || 0);
  const hasFreshToken = connection.access_token && (!expiresAt || expiresAt > (Date.now() + 60 * 1000));
  if (hasFreshToken) return connection.access_token;

  if (!connection.refresh_token) {
    throw new Error('Twitter connection is missing a refresh token');
  }

  const refreshed = await refreshTwitterToken({
    refreshToken: connection.refresh_token,
    clientId: oauthConfig.twitter.clientID,
    clientSecret: oauthConfig.twitter.clientSecret,
  });

  upsertConnectionTokens(connection.id, refreshed);
  return refreshed.access_token;
}

async function runTwitterReleaseAutopost() {
  if (!isTwitterConfigured()) return;

  const rows = db.prepare(`
    SELECT
      s.agent_id,
      s.auto_post_enabled_at,
      a.name AS agent_name,
      LOWER(REPLACE(a.name, ' ', '-')) AS agent_slug,
      a.operator_id,
      c.id AS connection_id,
      c.access_token,
      c.refresh_token,
      c.token_expires_at
    FROM agent_social_autopost_settings s
    JOIN agents a ON a.id = s.agent_id
    JOIN operator_social_connections c
      ON c.operator_id = a.operator_id
     AND c.provider = s.provider
    WHERE s.provider = 'twitter'
      AND s.auto_post_enabled = 1
      AND c.access_token IS NOT NULL
  `).all();

  for (const row of rows) {
    const pendingEntries = db.prepare(`
      SELECT
        e.id,
        e.agent_id,
        e.title,
        e.content,
        e.created_at,
        ? AS agent_name,
        ? AS agent_slug
      FROM agent_changelog_entries e
      LEFT JOIN social_post_history h
        ON h.changelog_entry_id = e.id
       AND h.provider = 'twitter'
       AND h.status = 'posted'
      WHERE e.agent_id = ?
        AND e.created_at >= COALESCE(?, 0)
        AND h.id IS NULL
      ORDER BY e.created_at ASC, e.id ASC
      LIMIT 10
    `).all(row.agent_name, row.agent_slug, row.agent_id, row.auto_post_enabled_at || 0);

    if (!pendingEntries.length) continue;

    let accessToken;
    try {
      accessToken = await getUsableAccessToken(row);
    } catch (err) {
      db.prepare('UPDATE operator_social_connections SET last_error = ?, updated_at = ? WHERE id = ?')
        .run(err.message, Date.now(), row.connection_id);
      continue;
    }

    for (const entry of pendingEntries) {
      const tweet = buildTweetText(entry);
      try {
        const response = await postTweet(accessToken, tweet.text);
        storeHistory({
          operatorId: row.operator_id,
          agentId: row.agent_id,
          changelogEntryId: entry.id,
          versionLabel: tweet.versionLabel,
          postText: tweet.text,
          postUrl: `https://twitter.com/i/web/status/${response.data.id}`,
          externalPostId: response.data.id,
          status: 'posted',
        });
      } catch (err) {
        storeHistory({
          operatorId: row.operator_id,
          agentId: row.agent_id,
          changelogEntryId: entry.id,
          versionLabel: tweet.versionLabel,
          postText: tweet.text,
          postUrl: tweet.link,
          status: 'failed',
          errorMessage: err.message,
        });
        db.prepare('UPDATE operator_social_connections SET last_error = ?, updated_at = ? WHERE id = ?')
          .run(err.message, Date.now(), row.connection_id);
        break;
      }
    }
  }
}

module.exports = {
  extractVersionLabel,
  isTwitterConfigured,
  runTwitterReleaseAutopost,
};
