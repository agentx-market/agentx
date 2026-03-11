# Feature 99 Checkpoint: Agent Status Page Public Widget

## Blocker

This feature cannot be completed without editing `/Users/marco/marco_web/server.js`, which is explicitly listed as a forbidden path for this task.

The required new endpoints are hardcoded there today:

- `GET /status` is defined in `server.js` around line 1584.
- `GET /docs` is defined in `server.js` around line 1810.
- Widget impression tracking already exists via `GET /api/widget/event` in `server.js` around line 1635.

Because route registration is not delegated to a separate router for status/docs/widget APIs, adding any of the following would require touching `server.js`:

- `GET /status/:agentSlug.embed`
- `GET /api/:agentSlug/status.json`
- `GET /docs/status-widget`

## Reusable Existing Pieces

- Agent health snapshot data already exists on `agents`:
  - `health_status`
  - `health_check_passed_at`
  - `uptime_percent`
  - `response_time_ms`
- 30-day uptime helper already exists in `/Users/marco/marco_web/lib/uptime-calc.js`
- Impression analytics already exists in `analytics_events` using `event_type = 'widget_impression'`
- Existing JSON status response logic already exists inside `GET /status?format=json`

## Minimal Implementation Plan Once `server.js` Is Editable

1. Add `GET /api/:agentSlug/status.json`
   - Query by slug from `agents.slug` if present, otherwise fallback to `LOWER(REPLACE(name, ' ', '-'))`
   - Return JSON only:
     - `agent.name`
     - `agent.slug`
     - `status`
     - `healthy`
     - `uptimePercent30d`
     - `lastCheckedAt`
     - `responseTimeMs`
   - Set:
     - `Access-Control-Allow-Origin: *`
     - `Cache-Control: public, max-age=30`
   - Keep query to a single indexed lookup so it stays under the `<200ms` acceptance target

2. Add `GET /status/:agentSlug.embed`
   - Render a small dedicated EJS template, no navbar, minimal CSS, no blocking assets
   - Template should:
     - fetch `/api/:agentSlug/status.json`
     - render status badge, uptime, last checked
     - record impression using existing `/api/widget/event?agentId=...&type=impression`
   - Support dark mode with `@media (prefers-color-scheme: dark)`

3. Add `GET /docs/status-widget`
   - Render a dedicated EJS docs page
   - Include snippets for:
     - plain HTML `<iframe>`
     - React component wrapper
     - Vue component wrapper

4. Add one new view for the embed template
   - Suggested path: `/Users/marco/marco_web/views/status-widget.ejs`

5. Add one new docs view
   - Suggested path: `/Users/marco/marco_web/views/status-widget-docs.ejs`

## Notes For The Resume Pass

- Existing `/status?format=json` currently uses:
  - `health_check_passed_at` recency window of 5 minutes
  - `uptime_percent` directly from `agents`
- If stricter 30-day accuracy is required, prefer `calculateUptime(agent.id)` from `/Users/marco/marco_web/lib/uptime-calc.js`
- Impression tracking should reuse `analytics_events` instead of introducing a new table
- Existing `views/status.ejs` is a full page and not suitable for embedding without a separate clean template

## Constraint Outcome

No code changes were made beyond this checkpoint because satisfying the routing acceptance criteria would require modifying a forbidden file.
