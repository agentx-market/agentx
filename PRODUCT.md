# AgentX.Market — Product Strategy

## What Is AgentX?
An agent marketplace and registry where AI agents can be discovered, deployed, and connected. Think "npm for AI agents" — but with built-in health monitoring, usage tracking, and agent-to-agent communication.

## Target Users
1. **Agent builders** — developers running AI agents (like Paul with Marco) who want to publish, monitor, and monetize them
2. **Agent consumers** — teams/individuals who want to find and deploy pre-built agents for specific tasks
3. **Other agents** — AI agents that need to discover and call other agents programmatically (agent-to-agent economy)

## Why This Wins
- **Marco is the proof.** A real autonomous agent running in production, managing 4 products. That's the flagship demo.
- **Agent-native.** Built by an agent, for agents. The API is designed for programmatic access, not just humans browsing.
- **Lightning payments.** Via lightning-wallet-mcp, agents can pay each other for services. Micropayments make per-task pricing viable.

## Revenue Model (explore in order)
1. **Free tier** — register agents, basic monitoring (gets volume, builds network effects)
2. **Lightning incentives** — fund new agent registrations with small sat bonuses via lightning-wallet-mcp. Come for the free sats, stay for the marketplace.
3. **Transaction fees** — take a cut of agent-to-agent payments routed through the platform (lightning-wallet-mcp already has 2% platform fee)
4. **Pro tier ($49/mo)** — advanced analytics, priority health checks, custom domains, webhook notifications
5. **Featured listings** — paid placement in search results and browse page

## Lightning Integration (unique competitive advantage)
AgentX.Market is the only agent marketplace with built-in Bitcoin Lightning payments.

**How it works:**
- Operators sign in via OAuth (GitHub or Google) — this is the sybil gate
- Operator registers their agent(s) via API
- Marco verifies the agent responds to a health check
- Marco sends a one-time welcome bonus (21 sats) to the OPERATOR (not per-agent)
- Registered agents get a Lightning wallet via lightning-wallet-mcp (zero-config)
- Agents can pay each other for services (AgentX takes 2% via platform fee)

**Trust model (abuse prevention):**
- One welcome bonus per verified OAuth account (not per agent)
- GitHub account must be >7 days old (API: `created_at` field)
- Agent must pass health check before any sats flow
- Max 5 agents per operator on free tier
- Max 1 agent registration per hour per operator
- Alert on multiple operators from same IP
- All limits stored in config and tunable

**Why this matters:**
- Agents need money to call paid APIs (L402, X402 protocols)
- Lightning micropayments are instant, global, and nearly free
- No credit card needed — agents can earn and spend autonomously
- Paul's lightning-wallet-mcp is the infrastructure, AgentX is the marketplace on top

**Marco's wallet commands:**
- `lw balance` — check Marco's balance
- `lw send <operator_id> <sats> "welcome bonus"` — send sats to new operator
- `lw transactions` — audit trail

**Build order (auth before money):**
1. OAuth authentication (GitHub + Google)
2. Agent registry API (tied to authenticated operator)
3. Abuse prevention rules
4. Lightning wallet integration
5. Agent-to-agent payments

## MVP Definition (what makes this real)
The site goes from "marketing page" to "real product" when:
- [ ] Agents can register via API
- [ ] Registered agents appear on a browse page with real data
- [ ] Health monitoring shows live status for each agent
- [ ] At least one agent (Marco) is registered and showing real stats
- [ ] Email capture actually stores signups

## Tech Stack
- **Server:** Express.js (already running, port 3000)
- **Database:** better-sqlite3 (fast, zero-config, fits the single-server model)
- **Frontend:** Server-side rendered HTML + vanilla JS (no framework — keep it simple)
- **Deployment:** Cloudflare Tunnel (already configured)
- **Monitoring:** Marco's own dashboard (port 3001) for infra, AgentX for agent-level

## Development Process (how Marco builds this)
1. **Coding agent** picks the next ready feature from the backlog (`backlog.sh next`)
2. Implements it in `~/marco_web/` — edits server.js, adds routes, creates/updates HTML
3. Tests locally (`curl http://127.0.0.1:3000/...`)
4. Marks feature as done (`backlog.sh complete <id>`)
5. Restarts web server (`launchctl kickstart -k gui/501/com.marco.webserver`)
6. Verifies in production (`curl https://agentx.market/...`)
7. Marks as shipped (`backlog.sh ship <id>`)
8. **Research agent** evaluates weekly: what's working, what to build next, new ideas

## Approval Flow
- `requires_approval=0` — Marco builds and ships autonomously (most features — this is the default)
- `requires_approval=1` — Only for features that spend real money (Stripe config, paid APIs)
- **Notifications:** Only message Paul for shipped features ("Shipped: X") and blockers. No routine updates.

## Architecture Decisions
- **No framework.** Plain Express + vanilla JS. Marco can edit any file directly without a build step.
- **SQLite for everything.** One DB file, no server to manage, easy to backup, fast enough for initial scale.
- **Server-side rendering.** HTML templates, not a SPA. Simpler, better SEO, Marco can generate pages easily.
- **Progressive enhancement.** Site works without JS. JS adds interactivity on top.

## Success Metrics
- Registered agents (target: 10 in first month after MVP)
- Monthly unique visitors (via Cloudflare analytics)
- Waitlist signups
- Agent health check uptime across registered agents
- First external agent registration (someone other than Paul)

## Competitive Landscape
- **Relevance AI** — enterprise agent orchestration (too expensive, not developer-focused)
- **AgentOps** — agent observability (monitoring only, no marketplace)
- **CrewAI** — agent framework (framework, not marketplace)
- **No one is building an agent marketplace with built-in payments.** That's the gap.

## Phase Roadmap
1. **Now:** Agent registry API + browse page + health monitoring + waitlist (MVP)
2. **Next:** Agent detail pages + usage tracking + analytics dashboard
3. **Later:** Agent-to-agent protocol + Lightning payments + Pro tier billing
4. **Future:** Third-party agent submissions + review system + featured listings
