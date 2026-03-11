# Feature #134 Checkpoint: Featured Agent Spotlight Rotation on Homepage

## Why implementation is blocked

The smallest viable implementation still requires edits to blocked files:

- [server.js](/Users/marco/marco_web/server.js)
  - `/` is served from static [public/index.html](/Users/marco/marco_web/public/index.html), so the homepage carousel can be added in static assets.
  - But the homepage needs a new API payload for spotlight agents, impression logging, click logging, and analytics aggregation. In this codebase those routes live in `server.js`.
  - Stripe checkout creation for paid plans also lives in `server.js` at `POST /api/create-payment-link`, and currently only supports `plan=pro`.
- [webhooks/stripe.js](/Users/marco/marco_web/webhooks/stripe.js)
  - To make spotlight purchases activate an agent slot automatically after successful Stripe payment, the webhook handler needs to persist spotlight purchase metadata and update agent/operator spotlight state.
- [views/dashboard.ejs](/Users/marco/marco_web/views/dashboard.ejs)
  - Acceptance requires spotlight impressions and CTR to appear in operator analytics. The existing operator analytics UI is rendered here, and this file is blocked.

Because those files are explicitly protected, I did not edit application code.

## What I verified

- Homepage is static: `.devstral-context.md` confirms `GET /` resolves to [public/index.html](/Users/marco/marco_web/public/index.html).
- Existing homepage JS is in [public/js/main.js](/Users/marco/marco_web/public/js/main.js).
- Existing analytics event storage already exists in [migrations/014_analytics_events.sql](/Users/marco/marco_web/migrations/014_analytics_events.sql) and current widget tracking is handled in [server.js](/Users/marco/marco_web/server.js) via `GET /api/widget/event`.
- Existing Stripe checkout creation is implemented in [server.js](/Users/marco/marco_web/server.js) and only maps `plan=pro`.
- Existing Stripe webhook processing is implemented in [webhooks/stripe.js](/Users/marco/marco_web/webhooks/stripe.js).
- Agents already have `featured` and `featured_until` columns in [db.js](/Users/marco/marco_web/db.js) and [migrations/065_featured_listings.sql](/Users/marco/marco_web/migrations/065_featured_listings.sql), but there is no homepage spotlight-specific state, no rotation API, and no analytics surface for CTR.

## Minimal implementation path once blocked files are editable

1. In `db.js` or a new migration:
   - Add spotlight-specific state, preferably on `agents`:
     - `spotlight_active INTEGER DEFAULT 0`
     - `spotlight_until INTEGER`
     - `spotlight_priority INTEGER DEFAULT 0`
   - Optionally add `spotlight_purchased_at INTEGER` for audit/order resolution.

2. In `server.js`:
   - Extend `POST /api/create-payment-link` with `plan=spotlight` and require auth.
   - Include metadata: `plan=spotlight`, `operator_id`, `agent_id`.
   - Add `GET /api/homepage/spotlight`:
     - Return up to 3 active agents.
     - Order active paid spotlight first regardless of `updated_at`.
     - Fill remaining slots with the newest eligible premium sponsors if needed.
   - Add `POST /api/homepage/spotlight-event`:
     - Track `homepage_spotlight_impression` and `homepage_spotlight_click` in `analytics_events`.
   - Extend operator analytics JSON to include spotlight impressions, spotlight clicks, and CTR per agent.

3. In `webhooks/stripe.js`:
   - On successful checkout for `plan=spotlight`, set spotlight fields on the purchased agent and expiration window.

4. In `public/index.html` and `public/js/main.js`:
   - Add the hero-slot carousel UI.
   - Fetch spotlight data, rotate every 5 seconds, and send impression/click events.
   - Link each card to `/agents/:slug`.

5. In `views/dashboard.ejs`:
   - Surface spotlight impressions, spotlight clicks, and CTR in operator analytics.

## Suggested data/query shape

- Use `analytics_events.event_type IN ('homepage_spotlight_impression', 'homepage_spotlight_click')`.
- CTR formula:
  - `spotlight_clicks / spotlight_impressions`
- Spotlight ordering:
  - First: currently purchased spotlight for the operator-selected agent
  - Then: additional active spotlight agents
  - Then: fallback premium sponsors up to max 3

## Constraint summary

This feature cannot be completed within the current blocked-path rules without failing acceptance criteria. The next step is to allow edits to `server.js`, `webhooks/stripe.js`, and `views/dashboard.ejs`, then implement the narrow path above.
