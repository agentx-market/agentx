const db = require('../db');

const DEFAULT_FEATURED_PRICE_CENTS = Number(process.env.FEATURED_LISTING_PRICE_CENTS || 9900);
const FEATURED_MIN_TERM_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_SPONSORSHIP_LABEL = 'Sponsored';
const DEFAULT_SPONSORSHIP_ACCENT_COLOR = '#f59e0b';

function normalizeSponsorshipLabel(value) {
  const label = String(value || '').trim().slice(0, 24);
  return label || DEFAULT_SPONSORSHIP_LABEL;
}

function normalizeSponsorshipAccentColor(value) {
  const color = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color.toLowerCase() : DEFAULT_SPONSORSHIP_ACCENT_COLOR;
}

function clampLimit(limit, fallback = 6) {
  const parsed = Number.parseInt(limit, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, 12);
}

function isFeaturedActive(featured, featuredUntil, now = Date.now()) {
  return Boolean(featured) && (!featuredUntil || Number(featuredUntil) > now);
}

function normalizeFeaturedRow(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description || 'Featured operator-backed listing on AgentX.',
    uptime_percent: row.uptime_percent === null || row.uptime_percent === undefined ? null : Number(row.uptime_percent),
    featured_until: row.featured_until,
    featured_requested_at: row.featured_requested_at || null,
    sponsorship_label: normalizeSponsorshipLabel(row.sponsorship_label),
    sponsorship_accent_color: normalizeSponsorshipAccentColor(row.sponsorship_accent_color),
    sponsorship_amount_cents: Number(row.sponsorship_amount_cents || 0),
    created_at: row.created_at,
    categories: row.category_names
      ? row.category_names.split(',').map((entry) => entry.trim()).filter(Boolean)
      : [],
  };
}

function getFeaturedListingCandidates(now = Date.now()) {
  return db.prepare(`
    SELECT
      a.id,
      a.name,
      a.description,
      a.uptime_percent,
      a.featured_until,
      a.featured_requested_at,
      a.sponsorship_label,
      a.sponsorship_accent_color,
      a.sponsorship_amount_cents,
      a.created_at,
      a.operator_id,
      LOWER(REPLACE(a.name, ' ', '-')) AS slug,
      GROUP_CONCAT(DISTINCT c.name) AS category_names
    FROM agents a
    LEFT JOIN agent_categories ac ON ac.agent_id = a.id
    LEFT JOIN categories c ON c.id = ac.category_id
    WHERE a.operator_id IS NOT NULL
      AND a.featured = 1
      AND (a.featured_until IS NULL OR a.featured_until > ?)
    GROUP BY a.id
    ORDER BY a.sponsorship_amount_cents DESC, COALESCE(a.featured_requested_at, a.created_at) ASC, a.uptime_percent DESC, a.created_at DESC, a.name ASC
  `).all(now);
}

function rotateRows(rows, limit, rotationSeed) {
  if (rows.length <= limit) {
    return { rows: rows.slice(0, limit), offset: 0 };
  }

  const seed = Number.isInteger(rotationSeed)
    ? rotationSeed
    : Math.floor(Date.now() / (60 * 60 * 1000));
  const offset = Math.abs(seed) % rows.length;
  const rotated = [];

  for (let index = 0; index < limit; index += 1) {
    rotated.push(rows[(offset + index) % rows.length]);
  }

  return { rows: rotated, offset };
}

function upsertStripeCustomer({ stripeCustomerId, operatorId = null, email = null }) {
  if (!stripeCustomerId) return;

  const existing = db.prepare(
    'SELECT id FROM stripe_customers WHERE stripe_customer_id = ?'
  ).get(stripeCustomerId);

  if (existing) {
    db.prepare(`
      UPDATE stripe_customers
      SET operator_id = COALESCE(?, operator_id),
          email = COALESCE(?, email)
      WHERE stripe_customer_id = ?
    `).run(operatorId, email, stripeCustomerId);
    return;
  }

  db.prepare(`
    INSERT INTO stripe_customers (operator_id, stripe_customer_id, email)
    VALUES (?, ?, ?)
  `).run(operatorId, stripeCustomerId, email);
}

function activateFeaturedListing({
  agentId,
  subscriptionId,
  paymentIntentId = null,
  startsAt = Date.now(),
  endsAt,
  priceCents = DEFAULT_FEATURED_PRICE_CENTS,
  sponsorshipLabel = DEFAULT_SPONSORSHIP_LABEL,
  sponsorshipAccentColor = DEFAULT_SPONSORSHIP_ACCENT_COLOR,
}) {
  if (!agentId || !subscriptionId || !endsAt) return false;

  const existing = db.prepare(
    'SELECT id FROM featured_agents WHERE subscription_id = ? ORDER BY id DESC LIMIT 1'
  ).get(subscriptionId);

  if (existing) {
    db.prepare(`
      UPDATE featured_agents
      SET agent_id = ?,
          payment_intent_id = COALESCE(?, payment_intent_id),
          started_at = ?,
          ends_at = ?,
          price_cents = ?,
          status = 'active'
      WHERE id = ?
    `).run(agentId, paymentIntentId, startsAt, endsAt, priceCents, existing.id);
  } else {
    db.prepare(`
      INSERT INTO featured_agents (
        agent_id,
        subscription_id,
        payment_intent_id,
        started_at,
        ends_at,
        price_cents,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, 'active')
    `).run(agentId, subscriptionId, paymentIntentId, startsAt, endsAt, priceCents);
  }

  db.prepare(`
    UPDATE agents
    SET featured = 1,
        featured_requested_at = COALESCE(featured_requested_at, ?),
        featured_until = ?,
        sponsorship_label = ?,
        sponsorship_accent_color = ?,
        sponsorship_amount_cents = ?,
        sponsorship_updated_at = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    startsAt,
    endsAt,
    normalizeSponsorshipLabel(sponsorshipLabel),
    normalizeSponsorshipAccentColor(sponsorshipAccentColor),
    priceCents,
    Date.now(),
    Date.now(),
    agentId
  );

  return true;
}

function deactivateFeaturedListingBySubscription(subscriptionId, status = 'canceled') {
  if (!subscriptionId) return false;

  const record = db.prepare(
    'SELECT id, agent_id FROM featured_agents WHERE subscription_id = ? ORDER BY id DESC LIMIT 1'
  ).get(subscriptionId);

  if (!record) return false;

  db.prepare(`
    UPDATE featured_agents
    SET status = ?
    WHERE id = ?
  `).run(status, record.id);

  db.prepare(`
    UPDATE agents
    SET featured = 0,
        sponsorship_updated_at = ?,
        updated_at = ?
    WHERE id = ?
  `).run(Date.now(), Date.now(), record.agent_id);

  return true;
}

function syncFeaturedListingFromSubscription(subscription, paymentIntentId = null) {
  const metadata = subscription?.metadata || {};
  if (metadata.feature_type !== 'listing') {
    return false;
  }

  const agentId = Number.parseInt(metadata.agent_id, 10);
  if (!Number.isInteger(agentId) || agentId <= 0) {
    return false;
  }

  const activeStatuses = new Set(['active', 'trialing']);
  const periodStart = subscription.current_period_start ? Number(subscription.current_period_start) * 1000 : Date.now();
  const periodEnd = subscription.current_period_end ? Number(subscription.current_period_end) * 1000 : null;
  const priceCents = Number(metadata.sponsorship_amount_cents || subscription.items?.data?.[0]?.price?.unit_amount || DEFAULT_FEATURED_PRICE_CENTS);

  if (!activeStatuses.has(subscription.status) || !periodEnd) {
    return deactivateFeaturedListingBySubscription(subscription.id, subscription.status || 'inactive');
  }

  return activateFeaturedListing({
    agentId,
    subscriptionId: subscription.id,
    paymentIntentId,
    startsAt: periodStart,
    endsAt: periodEnd,
    priceCents,
    sponsorshipLabel: metadata.sponsorship_label,
    sponsorshipAccentColor: metadata.sponsorship_accent_color,
  });
}

function recordSponsorshipPayment({
  operatorId,
  agentId,
  checkoutSessionId = null,
  stripeSubscriptionId = null,
  stripeInvoiceId = null,
  stripePaymentIntentId = null,
  stripeEventType,
  amountCents = 0,
  currency = 'usd',
  status = 'pending',
  createdAt = Date.now(),
}) {
  if (!operatorId || !agentId || !stripeEventType) return false;

  db.prepare(`
    INSERT INTO sponsorship_payments (
      operator_id,
      agent_id,
      checkout_session_id,
      stripe_subscription_id,
      stripe_invoice_id,
      stripe_payment_intent_id,
      stripe_event_type,
      amount_cents,
      currency,
      status,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    operatorId,
    agentId,
    checkoutSessionId,
    stripeSubscriptionId,
    stripeInvoiceId,
    stripePaymentIntentId,
    stripeEventType,
    Number(amountCents || 0),
    String(currency || 'usd').toLowerCase(),
    status,
    createdAt,
    Date.now()
  );

  return true;
}

function getFeaturedListings(limit = 6, options = {}) {
  const candidates = getFeaturedListingCandidates(options.now || Date.now());
  const cappedLimit = clampLimit(limit);
  const { rows, offset } = rotateRows(candidates, cappedLimit, options.rotationSeed);

  return {
    agents: rows.map(normalizeFeaturedRow),
    total: candidates.length,
    rotationOffset: offset,
  };
}

function setFeaturedRequest({ agentId, operatorId, enabled, now = Date.now() }) {
  const agent = db.prepare(`
    SELECT id, operator_id, featured, featured_until, featured_requested_at
    FROM agents
    WHERE id = ?
  `).get(agentId);

  if (!agent || agent.operator_id !== operatorId) {
    return null;
  }

  if (enabled) {
    const requestedAt = agent.featured ? (agent.featured_requested_at || now) : now;
    const minTermEndsAt = requestedAt + FEATURED_MIN_TERM_MS;
    const featuredUntil = Math.max(Number(agent.featured_until) || 0, minTermEndsAt);

    db.prepare(`
      UPDATE agents
      SET featured = 1,
          featured_requested_at = ?,
          featured_until = ?,
          updated_at = ?
      WHERE id = ?
    `).run(requestedAt, featuredUntil, now, agentId);

    return {
      agentId,
      enabled: true,
      featuredUntil,
      requestedAt,
      minTermEndsAt,
    };
  }

  db.prepare(`
    UPDATE agents
    SET featured = 0,
        updated_at = ?
    WHERE id = ?
  `).run(now, agentId);

  return {
    agentId,
    enabled: false,
    featuredUntil: agent.featured_until || null,
    requestedAt: agent.featured_requested_at || null,
    minTermEndsAt: agent.featured_requested_at ? agent.featured_requested_at + FEATURED_MIN_TERM_MS : null,
  };
}

function getFeaturedStats(operatorId) {
  const rows = db.prepare(`
    SELECT
      a.id AS agent_id,
      a.name,
      a.featured,
      a.featured_until,
      a.featured_requested_at,
      a.sponsorship_label,
      a.sponsorship_accent_color,
      a.sponsorship_amount_cents,
      SUM(CASE WHEN ae.event_type = 'featured_impression' THEN 1 ELSE 0 END) AS impressions,
      SUM(CASE WHEN ae.event_type = 'featured_click' THEN 1 ELSE 0 END) AS clicks
    FROM agents a
    LEFT JOIN analytics_events ae ON ae.agent_id = a.id
    WHERE a.operator_id = ?
    GROUP BY a.id
    ORDER BY a.created_at DESC, a.id DESC
  `).all(operatorId);

  return {
    summary: {
      activeFeaturedCount: rows.filter((row) => isFeaturedActive(row.featured, row.featured_until)).length,
      totalImpressions: rows.reduce((sum, row) => sum + Number(row.impressions || 0), 0),
      totalClicks: rows.reduce((sum, row) => sum + Number(row.clicks || 0), 0),
    },
    agents: rows.map((row) => ({
      agent_id: row.agent_id,
      name: row.name,
      active: isFeaturedActive(row.featured, row.featured_until),
      featured_until: row.featured_until || null,
      featured_requested_at: row.featured_requested_at || null,
      min_term_ends_at: row.featured_requested_at ? row.featured_requested_at + FEATURED_MIN_TERM_MS : null,
      sponsorship_label: normalizeSponsorshipLabel(row.sponsorship_label),
      sponsorship_accent_color: normalizeSponsorshipAccentColor(row.sponsorship_accent_color),
      sponsorship_amount_cents: Number(row.sponsorship_amount_cents || 0),
      impressions: Number(row.impressions || 0),
      clicks: Number(row.clicks || 0),
    })),
  };
}

module.exports = {
  DEFAULT_FEATURED_PRICE_CENTS,
  FEATURED_MIN_TERM_MS,
  activateFeaturedListing,
  deactivateFeaturedListingBySubscription,
  getFeaturedListings,
  getFeaturedStats,
  isFeaturedActive,
  normalizeSponsorshipAccentColor,
  normalizeSponsorshipLabel,
  recordSponsorshipPayment,
  setFeaturedRequest,
  syncFeaturedListingFromSubscription,
  upsertStripeCustomer,
};
