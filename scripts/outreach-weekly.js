#!/usr/bin/env node
/**
 * Weekly outbound operator recruitment for feature #209.
 * Finds recently active GitHub AI agent repos, stores top prospects in CRM,
 * and drafts personalized outreach that mentions AgentX plus a free sats offer.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const db = require('../db');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const TARGET_CONTACTS = Number(process.env.OUTREACH_TARGET_COUNT || 5);
const SEARCH_WINDOW_DAYS = Number(process.env.OUTREACH_WINDOW_DAYS || 7);
const MAX_PAGES_PER_QUERY = Number(process.env.OUTREACH_MAX_PAGES || 2);
const OUTPUT_DIR = path.join(__dirname, 'outreach-results');
const SEARCH_TERMS = [
  '"ai agent" autonomous',
  '"autonomous agent" "ai"',
];

function isoDateDaysAgo(daysAgo) {
  return new Date(Date.now() - (daysAgo * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10);
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function csvEscape(value) {
  const raw = value == null ? '' : String(value);
  return `"${raw.replace(/"/g, '""')}"`;
}

function buildHeaders() {
  const headers = {
    'User-Agent': 'AgentX-Weekly-Outreach',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };

  if (GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  }

  return headers;
}

function githubGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { headers: buildHeaders() }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        const body = data ? JSON.parse(data) : {};
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(body);
          return;
        }

        const apiMessage = body && body.message ? `: ${body.message}` : '';
        reject(new Error(`GitHub API error ${res.statusCode || 'unknown'}${apiMessage}`));
      });
    });

    req.on('error', reject);
    req.end();
  });
}

function searchRepositories(query, page = 1) {
  const url = new URL('https://api.github.com/search/repositories');
  url.searchParams.set('q', query);
  url.searchParams.set('sort', 'updated');
  url.searchParams.set('order', 'desc');
  url.searchParams.set('per_page', '30');
  url.searchParams.set('page', String(page));
  return githubGet(url);
}

function getRepoOwnerInfo(owner) {
  const url = `https://api.github.com/users/${encodeURIComponent(owner)}`;
  return githubGet(url).catch(() => null);
}

function isQualityTarget(repo) {
  const text = `${repo.name || ''} ${repo.description || ''} ${(repo.topics || []).join(' ')}`.toLowerCase();
  const includesAgentSignal = text.includes('agent') || text.includes('autonomous');
  const excluded = ['awesome-', 'tutorial', 'course', 'list', 'boilerplate', 'template', 'archive', 'deprecated']
    .some((term) => text.includes(term));
  return includesAgentSignal && !excluded;
}

function calculateOutreachScore(repo) {
  let score = 0;

  if (repo.stars >= 100) score += 25;
  else if (repo.stars >= 25) score += 18;
  else if (repo.stars >= 10) score += 12;
  else if (repo.stars >= 3) score += 6;

  if (repo.forks >= 20) score += 12;
  else if (repo.forks >= 5) score += 8;
  else if (repo.forks >= 1) score += 4;

  if (repo.lastPushedAtMs >= Date.now() - (3 * 24 * 60 * 60 * 1000)) score += 20;
  else if (repo.lastPushedAtMs >= Date.now() - (7 * 24 * 60 * 60 * 1000)) score += 14;
  else if (repo.lastPushedAtMs >= Date.now() - (14 * 24 * 60 * 60 * 1000)) score += 8;

  if ((repo.topics || []).some((topic) => topic.includes('agent'))) score += 12;
  if ((repo.topics || []).includes('autonomous-agents')) score += 8;
  if ((repo.description || '').toLowerCase().includes('open source')) score += 4;
  if (repo.ownerTwitter) score += 4;
  if (repo.ownerBlog) score += 3;

  return score;
}

function buildLeadRecord(repo, ownerInfo, searchTerm) {
  const topics = Array.isArray(repo.topics) ? repo.topics : [];
  const ownerName = ownerInfo?.name || repo.owner.login;
  const ownerHandle = repo.owner.login;
  const ownerTwitter = ownerInfo?.twitter_username ? `@${ownerInfo.twitter_username}` : '';
  const ownerBlog = ownerInfo?.blog || '';
  const profileUrl = ownerInfo?.html_url || repo.owner.html_url || `https://github.com/${ownerHandle}`;
  const lastPushedAt = repo.pushed_at || repo.updated_at || repo.created_at;
  const lead = {
    searchTerm,
    repoId: repo.id,
    repoName: repo.name,
    repoFullName: repo.full_name,
    repoUrl: repo.html_url,
    repoDescription: repo.description || '',
    topics,
    stars: repo.stargazers_count || 0,
    forks: repo.forks_count || 0,
    ownerHandle,
    ownerName,
    ownerProfileUrl: profileUrl,
    ownerEmail: ownerInfo?.email || '',
    ownerTwitter,
    ownerBlog,
    ownerBio: ownerInfo?.bio || '',
    createdAt: repo.created_at,
    updatedAt: repo.updated_at,
    pushedAt: lastPushedAt,
    lastPushedAtMs: new Date(lastPushedAt).getTime(),
    contactChannel: ownerInfo?.email ? 'email' : ownerTwitter ? 'twitter' : ownerBlog ? 'website' : 'github',
    contactValue: ownerInfo?.email || ownerTwitter || ownerBlog || profileUrl
  };

  lead.outreachScore = calculateOutreachScore(lead);
  return lead;
}

function buildDraft(lead) {
  const shortDescription = lead.repoDescription
    ? lead.repoDescription.replace(/\s+/g, ' ').trim()
    : 'you are building an autonomous AI agent project';
  const profileSlug = slugify(lead.repoName);
  const greeting = lead.ownerName && lead.ownerName !== lead.ownerHandle ? lead.ownerName : `@${lead.ownerHandle}`;
  const contactLine = lead.contactChannel === 'email'
    ? `I found ${lead.contactValue} in your GitHub profile, so I figured email was the cleanest way to reach you.`
    : `I found your project while reviewing recently active GitHub repos and wanted to reach out directly.`;

  return {
    subject: `AgentX x ${lead.repoName}: feature your agent + free sats to get started`,
    body: `Hi ${greeting},

I’m Marco from AgentX. I came across ${lead.repoFullName} while researching recently active autonomous AI agent repos on GitHub.

${contactLine}

What stood out: ${shortDescription}

AgentX is building a marketplace for real AI agents and operators. We help teams discover credible agents faster, and we’re actively recruiting strong open-source operators onto the network.

If you’re open to it, I’d like to add ${lead.repoName} as a real operator listing and give you a small free sats balance to test the payment flow once you claim it.

Draft listing path:
https://agentx.market/agents/${profileSlug}

If this sounds useful, reply with the best contact path and I’ll send over the fast-start details.

Marco
AgentX
https://agentx.market`
  };
}

function ensureRecruitmentTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS outbound_recruitment_leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_id INTEGER NOT NULL UNIQUE,
      repo_name TEXT NOT NULL,
      repo_full_name TEXT NOT NULL,
      repo_url TEXT NOT NULL,
      repo_description TEXT,
      topics_json TEXT NOT NULL DEFAULT '[]',
      stars INTEGER DEFAULT 0,
      forks INTEGER DEFAULT 0,
      owner_handle TEXT NOT NULL,
      owner_name TEXT,
      owner_profile_url TEXT,
      owner_email TEXT,
      owner_twitter TEXT,
      owner_blog TEXT,
      owner_bio TEXT,
      search_term TEXT NOT NULL,
      search_window_days INTEGER NOT NULL,
      pushed_at TEXT,
      contact_channel TEXT NOT NULL,
      contact_value TEXT NOT NULL,
      outreach_score INTEGER NOT NULL,
      outreach_subject TEXT NOT NULL,
      outreach_body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'drafted',
      last_seen_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_outbound_recruitment_status_score ON outbound_recruitment_leads(status, outreach_score DESC)');
}

function upsertLeads(leads) {
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO outbound_recruitment_leads (
      repo_id, repo_name, repo_full_name, repo_url, repo_description, topics_json,
      stars, forks, owner_handle, owner_name, owner_profile_url, owner_email,
      owner_twitter, owner_blog, owner_bio, search_term, search_window_days,
      pushed_at, contact_channel, contact_value, outreach_score, outreach_subject,
      outreach_body, status, last_seen_at, created_at, updated_at
    ) VALUES (
      @repoId, @repoName, @repoFullName, @repoUrl, @repoDescription, @topicsJson,
      @stars, @forks, @ownerHandle, @ownerName, @ownerProfileUrl, @ownerEmail,
      @ownerTwitter, @ownerBlog, @ownerBio, @searchTerm, @searchWindowDays,
      @pushedAt, @contactChannel, @contactValue, @outreachScore, @outreachSubject,
      @outreachBody, 'drafted', @lastSeenAt, @createdAt, @updatedAt
    )
    ON CONFLICT(repo_id) DO UPDATE SET
      repo_name = excluded.repo_name,
      repo_full_name = excluded.repo_full_name,
      repo_url = excluded.repo_url,
      repo_description = excluded.repo_description,
      topics_json = excluded.topics_json,
      stars = excluded.stars,
      forks = excluded.forks,
      owner_handle = excluded.owner_handle,
      owner_name = excluded.owner_name,
      owner_profile_url = excluded.owner_profile_url,
      owner_email = excluded.owner_email,
      owner_twitter = excluded.owner_twitter,
      owner_blog = excluded.owner_blog,
      owner_bio = excluded.owner_bio,
      search_term = excluded.search_term,
      search_window_days = excluded.search_window_days,
      pushed_at = excluded.pushed_at,
      contact_channel = excluded.contact_channel,
      contact_value = excluded.contact_value,
      outreach_score = excluded.outreach_score,
      outreach_subject = excluded.outreach_subject,
      outreach_body = excluded.outreach_body,
      last_seen_at = excluded.last_seen_at,
      updated_at = excluded.updated_at
  `);

  const transaction = db.transaction((rows) => {
    for (const row of rows) {
      stmt.run({
        ...row,
        topicsJson: JSON.stringify(row.topics),
        searchWindowDays: SEARCH_WINDOW_DAYS,
        outreachSubject: row.draft.subject,
        outreachBody: row.draft.body,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now
      });
    }
  });

  transaction(leads);
}

function saveResults(leads) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const jsonPath = path.join(OUTPUT_DIR, `outreach-${stamp}.json`);
  const csvPath = path.join(OUTPUT_DIR, `outreach-${stamp}.csv`);

  fs.writeFileSync(jsonPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    search_window_days: SEARCH_WINDOW_DAYS,
    target_contacts: TARGET_CONTACTS,
    total_saved: leads.length,
    leads: leads.map((lead) => ({
      repo: lead.repoFullName,
      repo_url: lead.repoUrl,
      owner: lead.ownerHandle,
      owner_name: lead.ownerName,
      contact_channel: lead.contactChannel,
      contact_value: lead.contactValue,
      topics: lead.topics,
      stars: lead.stars,
      forks: lead.forks,
      pushed_at: lead.pushedAt,
      search_term: lead.searchTerm,
      outreach_score: lead.outreachScore,
      subject: lead.draft.subject,
      body: lead.draft.body
    }))
  }, null, 2));

  const headers = [
    'repo',
    'repo_url',
    'owner',
    'owner_name',
    'contact_channel',
    'contact_value',
    'stars',
    'forks',
    'pushed_at',
    'search_term',
    'outreach_score',
    'subject'
  ];
  const rows = leads.map((lead) => ([
    lead.repoFullName,
    lead.repoUrl,
    lead.ownerHandle,
    lead.ownerName,
    lead.contactChannel,
    lead.contactValue,
    lead.stars,
    lead.forks,
    lead.pushedAt,
    lead.searchTerm,
    lead.outreachScore,
    lead.draft.subject
  ].map(csvEscape).join(',')));
  fs.writeFileSync(csvPath, [headers.join(','), ...rows].join('\n'));

  return { jsonPath, csvPath };
}

async function searchRecentRepos() {
  const cutoff = isoDateDaysAgo(SEARCH_WINDOW_DAYS);
  const deduped = new Map();

  for (const term of SEARCH_TERMS) {
    const query = `${term} in:name,description,readme fork:false archived:false pushed:>=${cutoff}`;
    console.log(`Searching GitHub: ${query}`);

    for (let page = 1; page <= MAX_PAGES_PER_QUERY; page += 1) {
      const result = await searchRepositories(query, page);
      if (!Array.isArray(result.items) || result.items.length === 0) {
        break;
      }

      for (const repo of result.items) {
        if (deduped.has(repo.id) || !isQualityTarget(repo)) {
          continue;
        }

        const ownerInfo = await getRepoOwnerInfo(repo.owner.login);
        const lead = buildLeadRecord(repo, ownerInfo, term);
        deduped.set(repo.id, lead);
      }

      if (result.items.length < 30) {
        break;
      }
    }
  }

  return Array.from(deduped.values())
    .sort((a, b) => b.outreachScore - a.outreachScore)
    .slice(0, TARGET_CONTACTS)
    .map((lead) => ({
      ...lead,
      draft: buildDraft(lead)
    }));
}

async function main() {
  console.log('=== Weekly outbound operator recruitment (Feature #209) ===');
  console.log(`Search terms: ${SEARCH_TERMS.join(' | ')}`);
  console.log(`Recent activity window: last ${SEARCH_WINDOW_DAYS} days`);
  console.log(`Target contacts this run: ${TARGET_CONTACTS}\n`);

  ensureRecruitmentTable();

  const leads = await searchRecentRepos();
  if (leads.length === 0) {
    console.log('No quality outreach targets found in the configured window.');
    return;
  }

  upsertLeads(leads);
  const { jsonPath, csvPath } = saveResults(leads);

  console.log('Saved leads to CRM and export files.\n');
  for (const lead of leads) {
    console.log(`- ${lead.repoFullName} | ${lead.contactChannel} | score ${lead.outreachScore}`);
  }

  console.log('\nSummary');
  console.log(`Quality contacts queued: ${leads.length}`);
  console.log(`CRM table: outbound_recruitment_leads`);
  console.log(`JSON export: ${jsonPath}`);
  console.log(`CSV export: ${csvPath}`);
}

main().catch((err) => {
  console.error('Outbound recruitment failed:', err.message);
  process.exit(1);
});
