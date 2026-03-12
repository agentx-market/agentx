const db = require('../db');

const DEFAULT_FEATURED_PRICE_CENTS = Number(process.env.FEATURED_LISTING_PRICE_CENTS || 9900);

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
        featured_until = ?,
        updated_at = ?
    WHERE id = ?
  `).run(endsAt, Date.now(), agentId);

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
        updated_at = ?
    WHERE id = ?
  `).run(Date.now(), record.agent_id);

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
  const priceCents = subscription.items?.data?.[0]?.price?.unit_amount || DEFAULT_FEATURED_PRICE_CENTS;

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
  });
}

function getFeaturedListings(limit = 6) {
  const rows = db.prepare(`
    SELECT
      a.id,
      a.name,
      a.description,
      a.uptime_percent,
      a.featured_until,
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
    ORDER BY a.featured_until DESC, a.uptime_percent DESC, a.created_at DESC, a.name ASC
    LIMIT ?
  `).all(Date.now(), clampLimit(limit));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description || 'Featured operator-backed listing on AgentX.',
    uptime_percent: row.uptime_percent === null || row.uptime_percent === undefined ? null : Number(row.uptime_percent),
    featured_until: row.featured_until,
    created_at: row.created_at,
    categories: row.category_names
      ? row.category_names.split(',').map((entry) => entry.trim()).filter(Boolean)
      : [],
  }));
}

module.exports = {
  DEFAULT_FEATURED_PRICE_CENTS,
  activateFeaturedListing,
  deactivateFeaturedListingBySubscription,
  getFeaturedListings,
  isFeaturedActive,
  syncFeaturedListingFromSubscription,
  upsertStripeCustomer,
};
