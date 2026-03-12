const express = require('express');
const db = require('../db');

const router = express.Router();
const FEATURED_MONTHLY_BID_CENTS = 9900;

router.get('/api/featured/rotating', (req, res) => {
  try {
    const now = Date.now();
    const agents = db.prepare(`
      SELECT
        a.id,
        a.name,
        LOWER(REPLACE(a.name, ' ', '-')) AS slug,
        COALESCE(review_stats.avg_rating, a.rating, 0) AS rating,
        COALESCE(review_stats.review_count, a.review_count, 0) AS review_count,
        a.created_at,
        (
          SELECT LOWER(COALESCE(s.plan, ''))
          FROM stripe_customers sc
          JOIN subscriptions s
            ON s.stripe_customer_id = sc.stripe_customer_id
          WHERE sc.operator_id = a.operator_id
            AND s.status IN ('active', 'trialing')
            AND LOWER(COALESCE(s.plan, '')) IN ('pro', 'team', 'business', 'enterprise', 'scale')
          ORDER BY
            CASE LOWER(COALESCE(s.plan, ''))
              WHEN 'enterprise' THEN 0
              WHEN 'business' THEN 1
              WHEN 'scale' THEN 2
              WHEN 'team' THEN 3
              WHEN 'pro' THEN 4
              ELSE 5
            END,
            COALESCE(s.current_period_end, s.created_at) DESC,
            s.id DESC
          LIMIT 1
        ) AS operator_tier,
        (
          (COALESCE(review_stats.avg_rating, a.rating, 0) * 20)
          + CASE
              WHEN a.created_at IS NULL THEN 0
              ELSE MAX(0, 30 - ((? - a.created_at) / 86400000.0))
            END
        ) AS ranking_score
      FROM agents a
      LEFT JOIN (
        SELECT
          agent_id,
          ROUND(AVG(rating), 1) AS avg_rating,
          COUNT(*) AS review_count
        FROM reviews
        GROUP BY agent_id
      ) review_stats
        ON review_stats.agent_id = a.id
      WHERE a.operator_id IS NOT NULL
        AND a.featured = 1
        AND (a.featured_until IS NULL OR a.featured_until > ?)
        AND EXISTS (
          SELECT 1
          FROM stripe_customers sc
          JOIN subscriptions s
            ON s.stripe_customer_id = sc.stripe_customer_id
          WHERE sc.operator_id = a.operator_id
            AND s.status IN ('active', 'trialing')
            AND LOWER(COALESCE(s.plan, '')) IN ('pro', 'team', 'business', 'enterprise', 'scale')
        )
      ORDER BY
        ranking_score DESC,
        COALESCE(review_stats.avg_rating, a.rating, 0) DESC,
        a.created_at DESC,
        a.sponsorship_amount_cents DESC,
        a.id DESC
      LIMIT 3
    `).all(now, now);

    res.set('Cache-Control', 'public, max-age=300');
    res.json({
      title: 'Top Agents This Week',
      bidPriceCents: FEATURED_MONTHLY_BID_CENTS,
      agents: agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        slug: agent.slug,
        rating: Number(Number(agent.rating || 0).toFixed(1)),
        reviewCount: Number(agent.review_count || 0),
        createdAt: agent.created_at || null,
        tier: String(agent.operator_tier || 'pro').toUpperCase(),
        thumbnailText: String(agent.name || '?').trim().slice(0, 2).toUpperCase(),
        badge: 'Featured',
        bidPriceCents: FEATURED_MONTHLY_BID_CENTS,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
