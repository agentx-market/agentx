#!/usr/bin/env node

const Database = require('better-sqlite3');
const path = require('path');

// Database path
const dbPath = path.join(__dirname, '../agentx.db');
const db = new Database(dbPath);

console.log('[seed] Starting agent seeding...');

// Check if agents already exist
const existingAgents = db.prepare('SELECT name FROM agents').all();
const existingNames = existingAgents.map(a => a.name);
console.log('[seed] Existing agents:', existingNames);

// Define the 6 sub-agents to seed
const agentsToSeed = [
  {
    name: 'Marco (Revenue Ops)',
    description: 'Autonomous revenue operations agent that handles customer onboarding, payment processing, subscription management, and financial reporting. Integrates with Stripe, Lightning Network, and internal analytics dashboards.',
    capabilities: ['Customer onboarding', 'Payment processing', 'Subscription management', 'Financial reporting', 'Stripe integration', 'Lightning Network payments'],
    endpoint_url: 'http://192.168.1.23:3000/health',
    pricing: '1.0',
    status: 'active',
    health_endpoint_url: 'http://192.168.1.23:3000/health',
    wallet_id: 'revops_wallet',
    operator_id: 'marco'
  },
  {
    name: 'Deep (QA & Testing)',
    description: 'Comprehensive QA and testing agent that runs automated test suites, smoke tests, regression tests, and performance benchmarks. Monitors uptime, tracks bugs, and generates test reports.',
    capabilities: ['Automated testing', 'Smoke tests', 'Regression tests', 'Performance benchmarks', 'Bug tracking', 'Test reporting'],
    endpoint_url: 'http://192.168.1.23:3000/health',
    pricing: '1.0',
    status: 'active',
    health_endpoint_url: 'http://192.168.1.23:3000/health',
    wallet_id: 'qa_wallet',
    operator_id: 'marco'
  },
  {
    name: 'Research (Competitor Intel)',
    description: 'Market research and competitive intelligence agent that monitors competitors, tracks industry trends, analyzes customer feedback, and generates insights for business strategy.',
    capabilities: ['Competitor monitoring', 'Market research', 'Trend analysis', 'Customer feedback analysis', 'Business insights', 'Strategy development'],
    endpoint_url: 'http://192.168.1.23:3000/health',
    pricing: '1.0',
    status: 'active',
    health_endpoint_url: 'http://192.168.1.23:3000/health',
    wallet_id: 'research_wallet',
    operator_id: 'marco'
  },
  {
    name: 'Security (Audit & Compliance)',
    description: 'Security and compliance agent that performs vulnerability scanning, credential audits, firewall checks, and regulatory compliance monitoring. Ensures all systems meet security standards.',
    capabilities: ['Vulnerability scanning', 'Credential audits', 'Firewall checks', 'Compliance monitoring', 'Security audits', 'Risk assessment'],
    endpoint_url: 'http://192.168.1.23:3000/health',
    pricing: '1.0',
    status: 'active',
    health_endpoint_url: 'http://192.168.1.23:3000/health',
    wallet_id: 'security_wallet',
    operator_id: 'marco'
  },
  {
    name: 'Marketing (Content & Leads)',
    description: 'Marketing automation agent that generates content, manages social media campaigns, runs lead generation programs, and tracks marketing analytics. Integrates with multiple platforms.',
    capabilities: ['Content generation', 'Social media management', 'Lead generation', 'Marketing analytics', 'Campaign management', 'SEO optimization'],
    endpoint_url: 'http://192.168.1.23:3000/health',
    pricing: '1.0',
    status: 'active',
    health_endpoint_url: 'http://192.168.1.23:3000/health',
    wallet_id: 'marketing_wallet',
    operator_id: 'marco'
  },
  {
    name: 'Coding (Development)',
    description: 'Development agent that writes code, reviews pull requests, refactors legacy systems, and implements new features. Supports multiple programming languages and frameworks.',
    capabilities: ['Code generation', 'Pull request reviews', 'Code refactoring', 'Feature implementation', 'Legacy system modernization', 'Multi-language support'],
    endpoint_url: 'http://192.168.1.23:3000/health',
    pricing: '1.0',
    status: 'active',
    health_endpoint_url: 'http://192.168.1.23:3000/health',
    wallet_id: 'coding_wallet',
    operator_id: 'marco'
  }
];

// Insert agents that don't already exist
let insertedCount = 0;

for (const agent of agentsToSeed) {
  if (!existingNames.includes(agent.name)) {
    const now = Date.now();
    const stmt = db.prepare(
      'INSERT INTO agents (operator_id, name, description, capabilities, endpoint_url, pricing, status, health_check_passed_at, health_endpoint_url, wallet_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    
    const result = stmt.run(
      agent.operator_id,
      agent.name,
      agent.description,
      JSON.stringify(agent.capabilities),
      agent.endpoint_url,
      agent.pricing,
      agent.status,
      now,  // health_check_passed_at
      agent.health_endpoint_url,
      agent.wallet_id,
      now,  // created_at
      now   // updated_at
    );
    
    console.log(`[seed] Inserted agent: ${agent.name} (ID: ${result.lastInsertRowid})`);
    insertedCount++;
  } else {
    console.log(`[seed] Skipping existing agent: ${agent.name}`);
  }
}

console.log(`[seed] Seeding complete. Inserted ${insertedCount} new agents.`);

// Close database connection
db.close();