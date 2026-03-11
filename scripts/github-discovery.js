#!/usr/bin/env node
/**
 * GitHub Agent Discovery Script
 * Scans for repos tagged 'ai-agent', 'mcp-server', 'langchain-agent'
 * Creates draft listings and tracks owners to contact
 */

const db = require('../db');
const https = require('https');

const TOPICS_TO_SCAN = ['ai-agent', 'mcp-server', 'langchain-agent'];
const BATCH_SIZE = 100;
const MAX_PAGES = 5;

// Get GitHub repos by topic
function getReposByTopic(topic, page) {
  return new Promise((resolve, reject) => {
    const url = `https://api.github.com/search/repositories?q=topic:${topic}&sort=stars&per_page=${BATCH_SIZE}&page=${page}`;
    
    const req = https.get(url, {
      headers: {
        'User-Agent': 'AgentX-Market-GitHub-Discovery',
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });

    req.on('error', reject);
  });
}

// Extract health check URL from repo metadata
function findHealthEndpoint(repo, owner) {
  // Check homepage for /health or /status endpoints
  if (repo.homepage) {
    const base = repo.homepage.replace(/\/$/, '');
    return `${base}/health`;
  }
  
  // Fallback to default health check URLs based on common patterns
  const domain = owner.login.toLowerCase().replace(/-/g, '');
  const patterns = [
    `https://${domain}.ai/health`,
    `https://${domain}.com/health`,
    `https://api.${repo.name}.com/health`,
    `https://${repo.name}.app/health`
  ];
  
  return patterns[0]; // Return first guess
}

// Parse capabilities from repo description and topics
function extractCapabilities(repo) {
  const capabilities = [];
  const desc = (repo.description || '').toLowerCase();
  const topics = repo.topics || [];
  
  if (desc.includes('nlp') || desc.includes('language')) capabilities.push('natural-language-processing');
  if (desc.includes('computer vision') || desc.includes('image')) capabilities.push('computer-vision');
  if (desc.includes('tool') || desc.includes('plugin')) capabilities.push('tool-integration');
  if (desc.includes('webhook')) capabilities.push('webhooks');
  if (desc.includes('api')) capabilities.push('rest-api');
  if (topics.includes('mcp-server')) capabilities.push('model-context-protocol');
  if (topics.includes('langchain')) capabilities.push('langchain');
  if (desc.includes('automation')) capabilities.push('workflow-automation');
  
  return capabilities.length > 0 ? JSON.stringify(capabilities) : '["general-purpose"]';
}

// Check if repo looks like a legitimate agent/MCP server
function isAgentRepo(repo) {
  const desc = (repo.description || '').toLowerCase();
  const topics = repo.topics || [];
  
  // Must have at least one relevant topic
  const hasRelevantTopic = TOPICS_TO_SCAN.some(t => topics.includes(t));
  
  // Exclude obvious non-agent repos
  const excludedKeywords = ['archive', 'deprecated', 'old', 'legacy', 'test', 'demo'];
  const isExcluded = excludedKeywords.some(k => desc.includes(k) && !topics.includes('ai-agent'));
  
  return hasRelevantTopic && !isExcluded;
}

// Create draft agent listing from GitHub repo
function createDraftListing(repo, owner) {
  const slug = repo.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const healthEndpoint = findHealthEndpoint(repo, owner);
  const capabilities = extractCapabilities(repo);
  
  const agentData = {
    operator_id: null, // No operator - just a GitHub account
    name: repo.name,
    description: repo.description || `An AI agent server for ${repo.name}.`,
    capabilities: capabilities,
    endpoint_url: null, // Unknown until claimed
    pricing: JSON.stringify({ model: 'free', per_token: 0 }),
    status: 'pending',
    health_check_required_by: Math.floor(Date.now()) + (7 * 24 * 60 * 60 * 1000), // 7 days
    created_at: Math.floor(Date.now()),
    updated_at: Math.floor(Date.now()),
    health_endpoint_url: healthEndpoint,
    health_status: 'offline', // Not verified yet
    source_github_id: repo.id,
    source_github_url: repo.html_url,
    source_owner_login: owner.login,
    source_stars: repo.stargazers_count
  };
  
  return agentData;
}

// Save discovered repo to pending claims table
function saveClaimRequest(repo, owner) {
  const slug = repo.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  
  // Check if already claimed or registered
  const existing = db.get(
    'SELECT * FROM github_agent_claims WHERE source_github_url = ?',
    [repo.html_url]
  );
  
  if (existing) {
    console.log(`  ✓ Already tracked: ${repo.full_name}`);
    return;
  }
  
  // Insert new claim request
  db.run(
    `INSERT INTO github_agent_claims 
     (source_github_id, source_github_url, source_owner_login, agent_name, health_endpoint_url, status, created_at) 
     VALUES (?, ?, ?, ?, ?, 'unclaimed', ?)`,
    [repo.id, repo.html_url, owner.login, repo.name, findHealthEndpoint(repo, owner), Math.floor(Date.now())]
  );
  
  console.log(`  ✓ Claim request created: ${repo.full_name}`);
}

// Main discovery process
async function discoverAgents() {
  console.log('[GitHub Discovery] Starting agent discovery...\n');
  
  const allRepos = new Map(); // Use map to dedupe by repo id
  
  // Scan each topic
  for (const topic of TOPICS_TO_SCAN) {
    console.log(`[GitHub Discovery] Scanning topic: ${topic}`);
    
    for (let page = 1; page <= MAX_PAGES; page++) {
      try {
        const result = await getReposByTopic(topic, page);
        
        if (!result.items || result.items.length === 0) {
          console.log(`[GitHub Discovery] No more results on page ${page}`);
          break;
        }
        
        let foundNew = false;
        for (const repo of result.items) {
          if (isAgentRepo(repo) && !allRepos.has(repo.id)) {
            allRepos.set(repo.id, { repo, owner: repo.owner });
            foundNew = true;
          }
        }
        
        console.log(`  Page ${page}: ${result.items.length} repos (${foundNew ? `${foundNew} new` : 'all seen'})`);
        
        if (result.items.length < BATCH_SIZE) break; // Last page
        
      } catch (err) {
        console.error(`[GitHub Discovery] Error fetching page ${page}:`, err.message);
        break;
      }
    }
  }
  
  console.log(`\n[GitHub Discovery] Found ${allRepos.size} unique agent repositories\n`);
  
  // Process each repo
  const processed = [];
  for (const [id, { repo, owner }] of allRepos) {
    try {
      const agentData = createDraftListing(repo, owner);
      
      // Check if agent already exists in database
      const existingAgent = db.get(
        'SELECT id FROM agents WHERE source_github_id = ?',
        [repo.id]
      );
      
      if (existingAgent) {
        console.log(`[GitHub Discovery] ✓ Already registered: ${repo.full_name} (ID: ${existingAgent.id})`);
        processed.push({ status: 'existing', repo, id: existingAgent.id });
      } else {
        // Create new draft listing
        const result = db.run(
          `INSERT INTO agents 
           (operator_id, name, description, capabilities, pricing, status, health_check_required_by, created_at, updated_at, health_endpoint_url, health_status, source_github_id, source_github_url, source_owner_login, source_stars)
           VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            null, // No operator yet
            agentData.name,
            agentData.description,
            agentData.capabilities,
            agentData.pricing,
            agentData.health_check_required_by,
            agentData.created_at,
            agentData.updated_at,
            agentData.health_endpoint_url,
            agentData.health_status,
            agentData.source_github_id,
            agentData.source_github_url,
            agentData.source_owner_login,
            agentData.source_stars
          ]
        );
        
        const newId = result.lastInsertRowid;
        console.log(`[GitHub Discovery] ✓ Draft created: ${repo.full_name} (Agent ID: ${newId})`);
        processed.push({ status: 'created', repo, id: newId });
      }
      
      // Save claim request for email outreach
      saveClaimRequest(repo, owner);
      
    } catch (err) {
      console.error(`[GitHub Discovery] Error processing ${repo.full_name}:`, err.message);
    }
  }
  
  console.log(`\n[GitHub Discovery] Complete! Processed ${processed.length} repos`);
  console.log(`  - Created: ${processed.filter(p => p.status === 'created').length}`);
  console.log(`  - Existing: ${processed.filter(p => p.status === 'existing').length}`);
  
  return { total: processed.length, created: processed.filter(p => p.status === 'created').length };
}

// Database migration to create github_agent_claims table
function setupDatabase() {
  console.log('[DB] Setting up claims tracking table...');
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS github_agent_claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_github_id INTEGER UNIQUE NOT NULL,
      source_github_url TEXT UNIQUE NOT NULL,
      source_owner_login TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      health_endpoint_url TEXT NOT NULL,
      status TEXT DEFAULT 'unclaimed',
      email_sent INTEGER DEFAULT 0,
      created_at INTEGER,
      UNIQUE(source_github_id)
    )
  `);
  
  console.log('[DB] Table setup complete');
}

// Main execution
(async () => {
  try {
    setupDatabase();
    const results = await discoverAgents();
    
    console.log('\n' + '='.repeat(60));
    console.log('DISCOVERY SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total repos scanned: ${results.total}`);
    console.log(`New draft listings: ${results.created}`);
    console.log('='.repeat(60));
    
  } catch (err) {
    console.error('[GitHub Discovery] Fatal error:', err);
    process.exit(1);
  }
})();

module.exports = { discoverAgents, createDraftListing, isAgentRepo };
