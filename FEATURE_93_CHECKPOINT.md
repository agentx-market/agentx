# Feature #93 Checkpoint: Stripe Revenue Share Dashboard

## Status
Blocked by protected files required for the smallest viable implementation.

## Why this is blocked
- `server.js` is protected, but it is the only place where dashboard and API routes are mounted.
- `views/dashboard.ejs` is protected, but the feature explicitly requires a revenue tab in the operator dashboard.
- `webhooks/stripe.js` is protected, and acceptance requires accurate Stripe webhook-backed data.

## Findings
- Operator dashboard rendering is wired directly in `server.js` via:
  - `GET /my-agents` -> `res.render('dashboard', { agents, operator: { id: req.operatorId } })`
- Existing dashboard subroutes are also hardcoded in `server.js`:
  - `GET /dashboard/health`
  - `GET /dashboard/keys`
  - `GET /dashboard/billing`
- There is no route autoload pattern for `routes/*.js` beyond the blog router, so a new `routes/revenue.js` file would not be reachable without editing `server.js`.
- The repo does have relevant billing data sources:
  - `usage_logs` table for request counts
  - `subscriptions` and `stripe_customers` tables for plan/customer linkage
  - `webhooks` table for stored webhook payloads
  - `payments` table, but this appears to be agent-to-agent marketplace billing, not Stripe subscriber billing

## Smallest viable implementation once protected files are editable
1. In `server.js`
- Add authenticated `GET /dashboard/revenue`
- Add authenticated `GET /api/dashboard/revenue-summary`
- Resolve current operator subscription tier from `stripe_customers` + `subscriptions`
- Aggregate:
  - `total_api_calls` from `usage_logs`
  - `estimated_transaction_volume` from Stripe webhook payloads stored in `webhooks`
  - `platform_fees_paid_this_month` from Stripe invoice/payment webhook payloads for the current month
  - `historical_revenue_chart_data` for the last 30 days by day

2. In `views/dashboard.ejs`
- Add revenue tab entry and content mount
- Show:
  - "Fees Paid This Month" card
  - line chart for daily usage vs fees
  - projected monthly cost calculator with live slider updates
  - free-tier upgrade CTA

3. In `webhooks/stripe.js`
- Ensure incoming Stripe webhook payloads persist the fields needed for invoice totals, fees, and daily chart reconstruction
- If current storage is incomplete, normalize key values into a dedicated summary table or expand stored payload handling

## Notes on data accuracy
- Because `webhooks` stores raw payload JSON, the API can derive month-to-date fees and 30-day chart points if Stripe events already include the needed invoice/payment objects.
- If the current webhook handler does not persist all relevant Stripe events or metadata that links them back to `operator_id`, `webhooks/stripe.js` must be updated before acceptance can be met.
