#!/usr/bin/env node
/**
 * Weekly AI Agent Repo Outreach - Feature #223
 * Searches GitHub for recent repos with AI agent tags, extracts contact info, drafts personalized outreach
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || 'YOUR_GITHUB_TOKEN'; // Store in ~/.git-credentials or env vars
const WEEK_DAYS = 7;
const TARGET_TAGS = ['ai-agent', 'llm-agent', 'mcp-server'];
const OUTPUT_DIR = path.join(__dirname, 'outreach-results');

// GitHub API helpers
function githubSearch(query, page = 1) {
  return new Promise((resolve, reject) => {
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=30&page=${page}`;
    
    const req = https.request(url, {
      headers: {
        'User-Agent': 'AgentX-Weekly-Outreach',
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`GitHub API error: ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

function getRepoOwnerInfo(owner) {
  return new Promise((resolve, reject) => {
    const url = `https://api.github.com/users/${owner}`;
    
    const req = https.request(url, {
      headers: {
        'User-Agent': 'AgentX-Weekly-Outreach',
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          resolve(null); // Rate limited or not found
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

function getRepoEmail(repoOwner) {
  return new Promise((resolve, reject) => {
    const url = `https://api.github.com/users/${repoOwner}/email`;
    
    const req = https.request(url, {
      headers: {
        'User-Agent': 'AgentX-Weekly-Outreach',
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200 && data) {
          resolve({ email: JSON.parse(data).email });
        } else {
          resolve(null);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

function extractTags(repo) {
  return TARGET_TAGS.filter(tag => repo.topics?.includes(tag));
}

async function searchRecentRepos() {
  const results = [];
  
  for (const tag of TARGET_TAGS) {
    console.log(`Searching for repos with tag: ${tag}`);
    
    let page = 1;
    let hasMore = true;
    
    while (hasMore && page <= 3) { // Limit to 3 pages max
      try {
        const data = await githubSearch(tag);
        
        if (!data.items) break;
        
        for (const repo of data.items) {
          const createdAfter = Date.now() - (WEEK_DAYS * 24 * 60 * 60 * 1000);
          
          // Filter by creation date and ensure tag matches
          if (new Date(repo.created_at).getTime() > createdAfter && extractTags(repo).length > 0) {
            const extractedTags = extractTags(repo);
            
            // Get owner info for outreach
            const ownerInfo = await getRepoOwnerInfo(repo.owner.login);
            
            results.push({
              name: repo.name,
              description: repo.description || '',
              url: repo.html_url,
              stars: repo.stargazers_count,
              forks: repo.forks_count,
              topics: repo.topics,
              matchedTags: extractedTags,
              owner: repo.owner.login,
              ownerName: ownerInfo?.name || repo.owner.login,
              ownerEmail: null, // Privacy-safe, don't expose emails in logs
              ownerTwitter: ownerInfo?.twitter_username ? `@${ownerInfo.twitter_username}` : null,
              ownerBio: ownerInfo?.bio || '',
              created_at: new Date(repo.created_at).toISOString().split('T')[0]
            });
          }
        }
        
        if (data.items.length < 30) {
          hasMore = false;
        } else {
          page++;
        }
      } catch (err) {
        console.error(`Error searching ${tag}:`, err.message);
        break;
      }
    }
  }
  
  return results;
}

function generateOutreachDrafts(repos) {
  const drafts = [];
  
  for (const repo of repos) {
    const isAgentXIntegrationOpportunity = 
      repo.description?.toLowerCase().includes('payment') ||
      repo.description?.toLowerCase().includes('wallet') ||
      repo.description?.toLowerCase().includes('lightning');
    
    let customMsg = '';
    if (isAgentXIntegrationOpportunity) {
      customMsg = `\n\nI noticed your project handles payments/wallets - AgentX.Market has Lightning Network integration for agent-to-agent payments. Worth exploring!`;
    } else {
      customMsg = `\n\nYour work with ${repo.matchedTags.join(', ')} is impressive - AgentX.Market specializes in connecting AI agents, and your repo would be a great addition to our marketplace.`;
    }
    
    const subject = `Quick question from AgentX.Market about ${repo.name}`;
    
    const draft = {
      owner: repo.owner,
      subject: subject,
      body: `Hi @${repo.owner},\n\nI'm Marco from AgentX.Market - we're a curated marketplace for AI agents and MCP servers.\n\nJust discovered your repo ${repo.name} about ${WEEK_DAYS} days ago. It's really cool how you're working with ${repo.matchedTags.join(' and ')}! The way you ${repo.description?.substring(0, 50) || 'approach'} stands out.\n\nWe'd love to feature your agent on our platform where developers can discover and integrate AI agents like yours. Here's a preview of how it would look:\nhttps://agentx.market/agents/${repo.name.toLowerCase().replace(/ /g, '-')}\n\nWould you be interested in listing your project?\n\nBest,\nMarco (AgentX.Market founder)${customMsg}\n`,
      stats: {
        stars: repo.stars,
        forks: repo.forks,
        topics: repo.topics.length
      },
      outreachScore: calculateOutreachScore(repo)
    };
    
    drafts.push(draft);
  }
  
  return drafts;
}

function calculateOutreachScore(repo) {
  let score = 0;
  
  // Star-based scoring (max 40 points)
  if (repo.stars >= 100) score += 40;
  else if (repo.stars >= 50) score += 30;
  else if (repo.stars >= 20) score += 20;
  else if (repo.stars >= 10) score += 10;
  
  // Fork-based scoring (max 30 points)
  if (repo.forks >= 50) score += 30;
  else if (repo.forks >= 20) score += 20;
  else if (repo.forks >= 10) score += 10;
  
  // Topic match bonus (max 20 points)
  score += repo.matchedTags.length * 10;
  
  // Active maintenance (max 10 points)
  const lastUpdated = new Date(repo.updated_at).getTime();
  if (lastUpdated > Date.now() - (7 * 24 * 60 * 60 * 1000)) {
    score += 10; // Updated in last week
  } else if (lastUpdated > Date.now() - (30 * 24 * 60 * 60 * 1000)) {
    score += 5;
  }
  
  return score;
}

function saveResults(results, drafts) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  const timestamp = new Date().toISOString().split('T')[0];
  const resultsFile = path.join(OUTPUT_DIR, `outreach-${timestamp}.json`);
  const csvFile = path.join(OUTPUT_DIR, `outreach-${timestamp}.csv`);
  
  // Save JSON with full details (private)
  fs.writeFileSync(resultsFile, JSON.stringify({
    search_date: new Date().toISOString(),
    week_days: WEEK_DAYS,
    total_found: results.length,
    repos: results.map(r => ({
      ...r,
      ownerEmail: 'EXTRACTED-but-not-logged' // Don't log emails for privacy
    })),
    drafts: drafts,
    avg_outreach_score: (drafts.reduce((sum, d) => sum + d.outreachScore, 0) / drafts.length).toFixed(1)
  }, null, 2));
  
  // Save CSV for CRM import (public-facing fields only)
  const csvHeaders = 'Name,URL,Owner,Stars,Forks,MatchedTags,Twitter,OutreachScore';
  const csvRows = results.map(r => 
    `${r.name},${r.url},@${r.owner},${r.stars},${r.forks},"${r.matchedTags.join(',')}",${r.ownerTwitter || ''},${r.outreachScore}`
  ).join('\n');
  
  fs.writeFileSync(csvFile, [csvHeaders, csvRows].join('\n'));
  
  console.log(`Saved ${results.length} results to ${resultsFile}`);
  console.log(`Saved ${results.length} CSV rows to ${csvFile}`);
  
  return { jsonPath: resultsFile, csvPath: csvFile };
}

async function main() {
  console.log('=== Weekly GitHub AI Agent Outreach (Feature #223) ===');
  console.log(`Searched tags: ${TARGET_TAGS.join(', ')}`);
  console.log(`Time window: last ${WEEK_DAYS} days\n`);
  
  const startTime = Date.now();
  
  try {
    // Phase 1: Search repos
    console.log('Phase 1: Searching GitHub...');
    const repos = await searchRecentRepos();
    
    if (repos.length === 0) {
      console.log('No matching repos found this week.');
      return;
    }
    
    console.log(`Found ${repos.length} potential outreach targets\n`);
    
    // Phase 2: Generate outreach drafts
    console.log('Phase 2: Generating personalized outreach drafts...');
    const drafts = generateOutreachDrafts(repos);
    
    // Sort by outreach score (highest priority first)
    drafts.sort((a, b) => b.outreachScore - a.outreachScore);
    
    // Phase 3: Save results
    console.log('Phase 3: Saving results for CRM...');
    const { jsonPath, csvPath } = saveResults(repos, drafts);
    
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log('\n=== Summary ===');
    console.log(`✅ Completed in ${totalTime}s`);
    console.log(`📊 Total repos found: ${repos.length}`);
    console.log(`⭐ Top outreach target: @${drafts[0].owner} (${drafts[0].outreachScore}/100 score)`);
    console.log(`📁 Files saved:`);
    console.log(`   - JSON (full): ${jsonPath}`);
    console.log(`   - CSV (CRM): ${csvPath}`);
    
  } catch (err) {
    console.error('❌ Outreach failed:', err.message);
    process.exit(1);
  }
}

// Run main function
main();
