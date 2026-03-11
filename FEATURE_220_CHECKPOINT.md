Feature #220 checkpoint

Blocked by do-not-edit paths from the task:

- `/Users/marco/marco_web/server.js`
- `/Users/marco/marco_web/views/dashboard.ejs`

Why this feature cannot be completed without editing them:

1. GitHub OAuth signup completion is implemented in `server.js` at `/auth/github/callback`.
   The welcome-wallet flow has to run there or immediately after it.

2. The current callback calls `oauthHandler.findOrCreateOperator('github', user)` without `await`,
   but `findOrCreateOperator` in `/Users/marco/marco_web/lib/oauth-handler.js` is `async`.
   That means `operator` is a Promise in the callback, so `createSessionToken(operator.id)` is not
   safe to extend and is already structurally wrong. Fixing that requires editing `server.js`.

3. Operator dashboard rendering is implemented by `res.render('dashboard', ...)` in `server.js`
   and the actual UI is `/Users/marco/marco_web/views/dashboard.ejs`.
   Displaying the operator wallet balance on the dashboard requires either:
   - passing wallet data into the template from `server.js`, or
   - adding client-side fetch/render logic in `views/dashboard.ejs`.
   Both paths are blocked.

Smallest viable unblock plan once those files are editable:

- In `db.js`:
  - add operator wallet columns/table, e.g. `operators.wallet_id` and `operators.wallet_funded_at`
    or a dedicated `operator_wallets` table
  - add a small ledger/audit table for the 21-sat signup bonus if desired

- In `lib/oauth-handler.js`:
  - on first operator creation for GitHub OAuth, create a `lightning-wallet-mcp` wallet for the operator
  - fund it with 21 sats
  - persist wallet id and funded timestamp

- In `server.js`:
  - `await oauthHandler.findOrCreateOperator(...)` in both OAuth callbacks
  - on the dashboard route, load operator wallet id and current balance
  - pass wallet data to the dashboard template

- In `views/dashboard.ejs`:
  - add a compact wallet card showing wallet id and current sat balance

Notes from repo inspection:

- Existing wallet helper: `/Users/marco/marco_web/lib/lw-wallet.js`
- Existing welcome bonus amount default is already `21` sats via `LW_WELCOME_BONUS_SATS`
- Existing agent wallet creation exists, but operator wallet creation does not
- Existing `welcome_bonuses` table is agent-oriented (`operator_id`, `agent_id`) and not suited to
  dashboard balance display by itself
