# AgentX.Market — UX Audit Results

**Date:** 2026-02-28
**Files audited:** `public/index.html`, `public/pricing.html`, `public/contact.html`, `public/features.html`, `public/about.html`, `public/css/style.css`, `public/js/main.js`

---

## Issue 1: Pricing Page CTA Dead-End (High Impact)

### Problem
Every CTA on the Pricing page routed to `/contact` — including the **Starter (free) tier**. A user who clicks "Get Started Free" on a $0 plan lands on a sales contact form asking for their name, company, and a message. This creates enormous friction for self-serve signups and likely kills most free-tier conversions.

**Broken flow:**
`/pricing` → "Get Started Free" (Starter) → `/contact` (sales form) → user abandons

### Fix Implemented
- Replaced the Starter plan's `<a href="/contact">` link with an **inline email capture form** directly on the pricing card.
- Form submits to `/api/contact` with `subject: 'waitlist'` (same endpoint used by the homepage).
- On success, the form collapses and shows a confirmation message ("You're on the list!").
- On error, gracefully falls back to `/contact`.
- Added subtitle copy: "No credit card · 3 agents included" to reinforce the free nature.
- Updated the bottom section CTA to split into "Get Started Free" (scrolls to the inline form) and "Talk to Sales" (still routes to `/contact`).

**Files changed:** `public/pricing.html`

---

## Issue 2: Mobile Nav Hamburger Has No Visual State (Medium Impact)

### Problem
The mobile hamburger button used a `.nav-toggle.active` class toggle in JavaScript but had **zero CSS rules for that class**. When a user tapped the menu button:
- The button looked identical open vs. closed — no X, no transform
- No backdrop/overlay appeared behind the menu, so the open nav looked like it was floating on content ambiguously
- `body` scroll wasn't locked, so the page could scroll under the open menu

This is a common source of "did I open or close that?" confusion on mobile.

### Fix Implemented
**CSS (`public/css/style.css`):**
- Added hamburger → X transform animation on `.nav-toggle.active`:
  - Line 1: `rotate(45deg) translate(5px, 5px)`
  - Line 2: `opacity: 0; scaleX(0)`
  - Line 3: `rotate(-45deg) translate(5px, -5px)`
- Added `.nav-backdrop` — a fixed full-screen overlay with `rgba(0,0,0,0.6)` + `backdrop-filter: blur(4px)` that appears when the menu opens.
- Added fade-in animation for the backdrop.

**JS (`public/js/main.js`):**
- Backdrop element is created dynamically so it applies to all pages without touching each HTML file.
- `openNav()` / `closeNav()` helpers added to consistently handle all three close triggers: toggle button, backdrop tap, nav link tap.
- `document.body.style.overflow = 'hidden'` while nav is open (prevents scroll-under).

**Files changed:** `public/css/style.css`, `public/js/main.js`

---

## Issue 3: "Browse All Agents" Button Misleads Users (Medium Impact)

### Problem
The agent showcase section on the homepage had a CTA: **"Browse All Agents" → `/features`**

The label creates a clear expectation: click here to see a list/marketplace of available agents. But `/features` is a standard platform marketing page (alternating feature blocks, code snippets, dashboard mockups) — not a browseable catalog. Users expecting to see agents, filter by task type, or read reviews would immediately bounce feeling misled.

Additionally, there was no messaging anywhere about when a full marketplace would be available, which could leave users confused about whether the product is real or vaporware.

### Fix Implemented
- Renamed the button from "Browse All Agents" to **"See Platform Features"** — accurately describes the `/features` page destination.
- Added a second CTA: **"Request a Demo"** → `/contact` for users who want to see agents in action before committing.
- Added a subtle one-liner below: _"Full marketplace launching Q2 2026 — join the waitlist"_ with a link to `/contact`. This sets honest expectations and captures interest.

**Files changed:** `public/index.html`

---

## Summary

| # | Issue | Severity | Files |
|---|-------|----------|-------|
| 1 | Pricing page all CTAs → `/contact` kills free-tier conversions | High | `pricing.html` |
| 2 | Mobile hamburger has no visual state (no X, no backdrop) | Medium | `style.css`, `main.js` |
| 3 | "Browse All Agents" links to a features page, not a marketplace | Medium | `index.html` |
