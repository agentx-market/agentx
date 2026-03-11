# Feature 138 Checkpoint

## Blockers

This feature cannot be completed within the current file-edit constraints.

Blocked files that are required by the acceptance criteria:

- `/Users/marco/marco_web/server.js`
  Required to mount `routes/admin.js` so `/api/admin/team-members` and `/api/admin/sso-config` are reachable.
- `/Users/marco/marco_web/views/dashboard.ejs`
  Required to display the enterprise admin surface and the audit log in the dashboard, which is explicitly part of acceptance.

Because those files are on the do-not-edit list, implementation was intentionally stopped before partial code changes.

## What I verified

- Route modules are not auto-loaded.
- `server.js` currently mounts `routes/blog.js` explicitly and does not mount any admin router.
- The operator dashboard is rendered directly from `server.js` with:
  `res.render('dashboard', { agents, operator: { id: req.operatorId } });`
- There is no existing dashboard client code that fetches `/api/admin/*` endpoints.

## Smallest viable implementation once blocked files are editable

### 1. Database additions

Add tables in `db.js` or a migration:

- `enterprise_accounts`
  - `id INTEGER PRIMARY KEY`
  - `operator_id TEXT UNIQUE NOT NULL`
  - `plan TEXT NOT NULL DEFAULT 'enterprise'`
  - `company_name TEXT`
  - `custom_rate_limit_per_minute INTEGER DEFAULT 5000`
  - `support_channel TEXT DEFAULT 'dedicated-slack'`
  - `sla_uptime_percent REAL DEFAULT 99.9`
  - `created_at INTEGER`
  - `updated_at INTEGER`

- `enterprise_team_members`
  - `id INTEGER PRIMARY KEY`
  - `operator_id TEXT NOT NULL`
  - `email TEXT NOT NULL`
  - `name TEXT`
  - `role TEXT DEFAULT 'member'`
  - `status TEXT DEFAULT 'active'`
  - `provisioned_via TEXT DEFAULT 'admin-panel'`
  - `created_at INTEGER`
  - `updated_at INTEGER`
  - `removed_at INTEGER`
  - `UNIQUE(operator_id, email)`

- `enterprise_sso_configs`
  - `id INTEGER PRIMARY KEY`
  - `operator_id TEXT UNIQUE NOT NULL`
  - `provider TEXT NOT NULL`
  - `sso_type TEXT NOT NULL DEFAULT 'saml2'`
  - `entry_point TEXT`
  - `issuer TEXT`
  - `callback_url TEXT`
  - `certificate TEXT`
  - `enabled INTEGER DEFAULT 0`
  - `created_at INTEGER`
  - `updated_at INTEGER`

- `enterprise_audit_logs`
  - `id INTEGER PRIMARY KEY`
  - `operator_id TEXT NOT NULL`
  - `actor_operator_id TEXT`
  - `action TEXT NOT NULL`
  - `target_type TEXT NOT NULL`
  - `target_id TEXT`
  - `details TEXT`
  - `created_at INTEGER`

### 2. Route module

Create `routes/admin.js` with:

- auth guard using `req.operatorId`
- helper to ensure operator has an enterprise account
- endpoints:
  - `GET /api/admin/team-members`
  - `POST /api/admin/team-members`
  - `DELETE /api/admin/team-members/:id`
  - `GET /api/admin/sso-config`
  - `POST /api/admin/sso-config`
  - optional `POST /api/admin/sso-config/test-login`

Each mutating endpoint should insert an `enterprise_audit_logs` row.

### 3. Server mount

In `server.js`, add:

```js
const adminRouter = require('./routes/admin');
app.use(adminRouter);
```

That is the minimum change needed to make the new API endpoints live.

### 4. Enterprise page

Create `views/enterprise.ejs` with:

- enterprise pricing/feature summary
- SSO section covering Okta, Auth0, SAML 2.0
- custom API rate limits
- dedicated support channel
- SLA 99.9% uptime
- audit logs
- provisioning/deprovisioning

Optional route if desired:

- `GET /enterprise` rendering `enterprise.ejs`

This route would also need a `server.js` edit unless another mounted router owns it.

### 5. Dashboard changes

In `views/dashboard.ejs`, add:

- team member management panel
- SSO config form
- audit log table
- client-side calls to:
  - `/api/admin/team-members`
  - `/api/admin/sso-config`

Without this edit, the acceptance line "audit log shows all actions in dashboard" cannot be met.

### 6. SSO login acceptance

Smallest realistic interpretation:

- Store SAML config for Okta/Auth0/custom IdP
- expose a test/login initiation endpoint
- complete ACS callback handling and map authenticated email to a provisioned team member

This also likely requires additional auth routes in `server.js`, so it is blocked under current constraints.

## Recommended next step

Lift the block on:

- `/Users/marco/marco_web/server.js`
- `/Users/marco/marco_web/views/dashboard.ejs`

Then implement the route mount, dashboard admin UI, audit log rendering, and SSO auth flow in one pass.
