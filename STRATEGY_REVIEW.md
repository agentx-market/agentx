# AgentX.Market — Strategy Review Process

## Problem This Solves
Marco can build features fast, but building the WRONG features fast is worse than building nothing. This process ensures Marco validates before building and measures after shipping.

## Three Loops

### 1. Before Building — Validate (research agent, before promoting backlog items)
Every feature should answer YES to at least one:
- [ ] Someone asked for this (contact form, GitHub issue, social mention)
- [ ] Competitors have this and users expect it
- [ ] It directly enables revenue (payments, signups, retention)
- [ ] Marco needs it to operate AgentX itself (dogfooding)

If none are true, the feature goes to "ideas" not "ready."

### 2. After Shipping — Measure (coding agent, after each deploy)
For every shipped feature, track within 7 days:
- Is anyone using it? (check server logs: `grep "GET /api/agents" ~/marco_web/submissions/` or access logs)
- Did signups/contact form submissions change?
- Did any user mention it?

If a feature gets zero usage after 2 weeks, log that signal — it informs what NOT to build next.

### 3. Weekly — Course Correct (research agent, Saturday review)
The Saturday review must answer these 5 questions:

1. **Who visited this week?** (Cloudflare analytics, server logs, contact submissions)
2. **What did they want?** (contact form subjects, search queries if available, referrer URLs)
3. **What did we ship and did anyone care?** (feature → usage mapping)
4. **What are potential users complaining about elsewhere?** (GitHub issues in agent repos, Reddit/HN threads about agent tooling pain points)
5. **Should we pivot, persist, or pause?**
   - **Pivot:** Market signals say we're building the wrong thing
   - **Persist:** Signals are encouraging, keep going
   - **Pause:** Not enough signal yet, need more data before building more

### Weekly Report to Paul (Telegram, every Saturday)
Short, structured, requires no action unless Paul wants to redirect:

```
AgentX Weekly — [date]

Shipped: [feature list]
Visitors: [count] | Signups: [count] | Contacts: [count]
Market signal: [one sentence — what potential users are saying/doing]
Next week: [what Marco plans to build]
Confidence: [high/medium/low] that we're building the right thing
Risk: [biggest risk to product-market fit]
```

Paul can reply with a redirect or thumbs up. No reply = keep going.

## Market Research Queries (research agent should run these weekly)
```bash
# What are agent developers struggling with?
~/web_search.sh "AI agent deployment problems 2026"
~/web_search.sh "MCP server hosting marketplace"
~/web_search.sh "AI agent monitoring tools"

# What are people searching for that we could serve?
~/web_search.sh "site:reddit.com AI agent marketplace"
~/web_search.sh "site:news.ycombinator.com agent registry"

# GitHub signals — what are developers building?
gh api 'search/repositories?q=agent+marketplace+created:>2026-02-01&sort=stars'
gh api 'search/issues?q="agent+registry"+OR+"agent+marketplace"&sort=created'
```

## Pivot Triggers (auto-evaluate monthly)
If ANY of these are true after 30 days of building, Marco should flag to Paul:
- Zero external visitors (only Marco/Paul hitting the site)
- Zero waitlist signups
- Zero contact form submissions from non-Paul humans
- A well-funded competitor launched the same thing
- The "agent economy" narrative has cooled (no new GitHub activity, no social buzz)

## Continuous Reevaluation
The product direction, value prop, and business model are NOT fixed. Every Saturday review should ask:
- Is our value prop still right? (marketplace for agents with Lightning payments)
- Is our target user still right? (agent builders / developers)
- Is our revenue model still viable? (transaction fees + subscriptions)
- Should we pivot to something adjacent?

If market signals consistently point somewhere else, Marco should draft a pivot proposal and send it to Paul. Don't keep building the wrong thing.

## Anti-Patterns to Avoid
- Building features because they're technically interesting (not because users need them)
- Polishing UI before validating that anyone visits the page
- Adding complexity (auth, billing, dashboards) before there's a single real user
- Spending more time on the backlog system than on the product itself
- **Sitting idle when there's always research, content, outreach, or UX work to do**
