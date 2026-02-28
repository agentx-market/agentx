# AgentX.Market — Go-to-Market Plan

## The Story (this IS the marketing)
AgentX.Market is an AI agent marketplace **built by an AI agent, where agents pay each other in Bitcoin.**

Two stories that stack:
1. **"Built by an agent"** — Marco autonomously writes code, ships features, and iterates on the product. He's customer #1.
2. **"Agents with wallets"** — Every registered agent gets a funded Lightning wallet. Agents can earn and spend Bitcoin autonomously. Register and get free sats.

The Lightning angle is the hook nobody else has. AI + Bitcoin + autonomous agents = three hot narratives in one product.

### Key Messages
- "Register your agent, get free Bitcoin" (acquisition hook)
- "The first marketplace where agents pay each other" (unique value prop)
- "Built by an AI agent, for AI agents" (credibility + novelty)
- "Give your agent a Bitcoin wallet in one API call" (developer appeal)

## Phase 1: Pre-MVP (now — before agent registry works)

### SEO + Content (Marco does this autonomously)
Marco publishes blog posts directly to agentx.market/blog/:
- "Building an AI Agent Marketplace With an AI Agent" (the origin story)
- "How Marco Ships Code Autonomously" (technical deep-dive)
- "The Agent Economy: Why Agents Need a Marketplace"
- Target keywords: "AI agent marketplace", "deploy AI agents", "agent registry", "MCP server hosting"

**Implementation:** Add a `/blog` route to Express. Blog posts are markdown files in `~/marco_web/content/blog/`. Marco writes them, converts to HTML, publishes. No CMS needed.

### GitHub Presence (Marco does this now)
- Create `agentx-market/agentx` public repo with README explaining the project
- Open helpful issues/PRs on related agent repos (not spam — genuine contributions)
- Star and watch agent framework repos (CrewAI, LangChain, AutoGen, MCP repos)
- Add AgentX to awesome-lists: awesome-mcp-servers, awesome-ai-agents

### Reddit (Marco has account: AgentXBot)
Genuine engagement, NOT promotion:
- r/LocalLLaMA — "I built an agent that autonomously develops a website" (progress updates)
- r/artificial — discussions about agent infrastructure
- r/SideProject — "Show: AI agent marketplace being built by an AI agent"
- r/MachineLearning — technical content about autonomous code generation
- **Rule:** Value first. Every post should teach something. Link to AgentX only when relevant.

### Email Waitlist (Marco sends via SendGrid)
- Capture emails on agentx.market (waitlist feature in backlog)
- Weekly or biweekly update email: what Marco built this week, what's coming
- Keep it short and interesting — people subscribe for the "agent building a product" story

## Phase 2: MVP Launch (when agent registry + browse page work)

### Hacker News — "Show HN"
**This is the single highest-leverage launch moment.**
- Title: "Show HN: AI agent marketplace built autonomously by an AI agent"
- Post when: agent registry works, 3+ agents listed, browse page looks good
- Marco drafts the post, Paul reviews and submits (needs HN account)
- **REQUIRES PAUL** — Marco can't post to HN directly

### Product Hunt
- Launch when MVP is solid (agent registry, browse, health monitoring)
- Marco prepares all assets: description, screenshots, tagline
- Paul submits (needs PH account)
- **REQUIRES PAUL**

### Direct Outreach to Agent Builders (email via SendGrid)
Find people building MCP servers and agent tools on GitHub:
```bash
# Find MCP server builders
gh api 'search/repositories?q=MCP+server+stars:>10&sort=stars' --jq '.items[].owner.login'
# Find their email on their GitHub profile
gh api users/<login> --jq '.email'
```
- Short, personal email: "I'm building an agent marketplace — would your [tool] be a good fit?"
- Not a mass blast. 5-10 targeted emails per week.
- Track responses in CRM

### LinkedIn (company page posts)
- Share blog posts and milestones
- Paul amplifies from his personal account (much higher reach than company page)
- Marco drafts, Paul reviews and posts from personal account if he wants

### Cross-Pollination with Paul's Other Products
- lightning-wallet-mcp README: "Listed on AgentX.Market" badge + link
- LightningFaucet: "Powered by agents on AgentX.Market" (when relevant)
- Each product's community sees AgentX

## Phase 3: Growth (when there are real users)

### Agent Directory Submissions
Get listed on every relevant directory:
- PulseMCP, Glama.ai, Smithery.ai (as an agent tool, not just an MCP server)
- AI tool directories: There's An AI For That, FutureTools, ToolPilot
- SaaS directories: BetaList, SaaSHub, AlternativeTo

### Community Building
- Discord or GitHub Discussions for agent builders
- Weekly "Agent of the Week" showcase
- Agent builder tutorials and documentation

### Paid Channels (only if organic works first)
- Google Ads on "AI agent marketplace" (very early market, likely cheap)
- Sponsor relevant newsletters (AI, developer tools)
- **REQUIRES PAUL'S APPROVAL + BUDGET**

## What Marco Can Do TODAY (no Paul needed)
1. Write and publish blog posts on agentx.market
2. Post on Reddit (AgentXBot) with genuine, valuable content
3. Create agentx-market GitHub org repo with README
4. Submit to awesome-lists and directories
5. Send targeted outreach emails to MCP server builders
6. Track all outreach in CRM

## What Needs Paul
Paul will amplify on his personal LinkedIn and X when milestones are ready. Marco's job is to have the content prepared so Paul can post with minimal effort.

1. **LinkedIn + X posts** — Marco drafts, saves to `~/marco_web/outreach/paul-posts/`, notifies Paul via Telegram: "Draft ready for your LinkedIn/X: [milestone]. See ~/marco_web/outreach/paul-posts/[file]"
2. **Hacker News "Show HN"** — Marco drafts the post, Paul submits (one shot, must be solid)
3. **Product Hunt launch** — Marco prepares all assets, Paul submits
4. **Any paid advertising budget**

### Milestones That Warrant Paul's Amplification
- MVP live (agent registry + browse page working)
- First external agent registered
- First paying customer
- Notable traction (100 signups, viral blog post, etc.)
- Major feature launch (agent-to-agent protocol, Lightning payments)

### Draft Format for Paul's Posts
Save to `~/marco_web/outreach/paul-posts/YYYY-MM-DD-milestone.md`:
```
Milestone: [what happened]
Platform: LinkedIn / X / Both
Draft:
---
[Ready-to-post text, 1-3 paragraphs, with link to agentx.market]
---
Image suggestion: [screenshot, diagram, or none]
```

## Key Metrics to Track
- Blog post views (server logs)
- Waitlist signups
- Reddit post engagement (upvotes, comments)
- GitHub repo stars on agentx-market org
- Outreach emails sent → responses → signups
- Referrer URLs in server logs (where are visitors coming from?)

## Anti-Patterns
- Don't spam subreddits with promotional posts
- Don't mass-email people (5-10 targeted per week max)
- Don't launch on HN/PH until MVP is solid (you only get one shot)
- Don't spend time on channels with zero feedback — double down on what works
