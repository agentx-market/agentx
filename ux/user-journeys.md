# AgentX User Journeys

## Journey 1: Agent Builder (Developer creating an agent)

### Flow Steps:
1. Landing page (agentx.market/) → discovers AgentX value prop
2. Click "Build an Agent" CTA → navigates to /signup
3. Signup form → enters email, password, verification
4. Email verification → clicks link, confirms account
5. Dashboard → onboarded, sees "Create Your Agent" button
6. Agent creation form (/agents/new) → fills name, description, MCP config
7. Agent registry → lists new agent, visible to consumers

### Test Results:
- [ ] Landing page loads without errors (check console for JS errors)
- [ ] Signup form validates email format correctly
- [ ] Password requirements are clear (min 8 chars, 1 number, 1 special)
- [ ] Email verification email arrives within 30 seconds
- [ ] Verification link is valid and doesn't expire prematurely
- [ ] Dashboard loads after signup with no blank states or 404s
- [ ] Agent creation form submits without CORS errors
- [ ] New agent appears in /api/agents within 5 seconds

### Friction Points Identified:
- Password requirements not shown until after failed attempt
- No "back" link from verification page if email is wrong
- Agent creation form doesn't show success confirmation before redirect
- Dashboard onboarding spinner doesn't timeout (infinite load if API fails)

### Priority Fixes:
- Show password rules on signup form BEFORE submission
- Add "Change email?" link on verification page
- Add toast notification after agent creation
- Add 5-second timeout to dashboard loader

## Journey 2: Agent Consumer (User browsing and using agents)

### Flow Steps:
1. Landing page (agentx.market/) → discovers agents available
2. Browse agents (/agents) → lists all published agents
3. Click agent → view details, MCP config, creator info
4. Call agent endpoint (POST /api/agents/{id}/invoke) → test agent
5. Results returned → compare against alternatives

### Test Results:
- [ ] /agents page loads within 2 seconds (check network tab)
- [ ] Agent cards display image, name, description, creator name
- [ ] Search/filter agents works (by category, by creator, by rating)
- [ ] Click agent card → /agents/{slug} loads without error
- [ ] Agent detail page shows full description, config, creator profile
- [ ] "Test Agent" button is visible and clickable
- [ ] API endpoint POST /api/agents/{id}/invoke accepts test input
- [ ] Response returns within 5 seconds with proper JSON
- [ ] Error handling: shows clear message if agent fails

### Friction Points Identified:
- Agent search doesn't auto-complete or suggest
- No ratings or reviews shown on agent cards
- "Test Agent" button is gray (disabled) until page fully loads (confusing)
- API response doesn't include execution time or cost
- No "Related Agents" recommendations on detail page

### Priority Fixes:
- Add search with real-time suggestions (debounce 300ms)
- Show star ratings from reviews table
- Enable "Test Agent" button immediately (disable only if 404)
- Return { response, executionMs, costSats } in API response
- Add "Similar agents" query on detail page

## Drop-Off Risks

1. **Signup to first agent creation** — users land in dashboard with no clear next step
2. **Agent consumer without existing account** — friction to invoke agents without signup
3. **Long API response times** — users waiting >3s abandon test flow
4. **Poor error messages** — "500 Internal Server Error" kills trust

## Testing Checklist (Manual QA)

- [ ] Test signup with invalid email (should show error)
- [ ] Test signup with weak password (should show requirement warning)
- [ ] Test email verification with expired link (should show friendly error)
- [ ] Test agent creation with empty fields (should validate required fields)
- [ ] Test agent invocation with missing required parameters
- [ ] Test API response timeout (kill server mid-request, check error handling)
- [ ] Test consumer journey without account (verify public agent access works)
- [ ] Test mobile responsiveness on /agents and /agents/{slug}