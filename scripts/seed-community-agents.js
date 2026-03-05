#!/usr/bin/env node
/**
 * Seed Community Agent Listings
 * Creates skeleton agent listings from public sources for the browse page.
 * Target: 50+ agents with 'Claim this listing' functionality.
 */

const db = require('../db');
const fs = require('fs');
const path = require('path');

// Community listing data from public directories
const COMMUNITY_AGENTS = [
  // GitHub Trending AI Repos
  {
    name: 'AutoGPT',
    description: 'Autonomous AI agent that can accomplish any goal. Self-guided, internet-connected AI with memory and tool use.',
    categories: ['Productivity', 'Data'],
    external_url: 'https://github.com/Significant-Gravitas/AutoGPT',
    source: 'GitHub Trending'
  },
  {
    name: 'BabyAGI',
    description: 'Task-driven autonomous agent that creates and prioritizes tasks. Popular AGI research project.',
    categories: ['Productivity'],
    external_url: 'https://github.com/yoheinakajima/babyagi',
    source: 'GitHub Trending'
  },
  {
    name: 'LangChain',
    description: 'Framework for developing applications powered by language models. Build contextual AI apps.',
    categories: ['Productivity', 'Data'],
    external_url: 'https://github.com/langchain-ai/langchain',
    source: 'GitHub Trending'
  },
  {
    name: 'LlamaIndex',
    description: 'Data framework for LLM applications. Ingest, structure, and access your data for AI apps.',
    categories: ['Data'],
    external_url: 'https://github.com/run-llama/llama_index',
    source: 'GitHub Trending'
  },
  {
    name: 'CrewAI',
    description: 'Framework for orchestrating role-playing autonomous AI agents. Collaborative agent workflows.',
    categories: ['Productivity'],
    external_url: 'https://github.com/joaomdmoura/crewai',
    source: 'GitHub Trending'
  },
  {
    name: 'Flowise',
    description: 'Low-code drag & drop tool for building LLM apps. Visual builder for LangChain apps.',
    categories: ['Productivity'],
    external_url: 'https://github.com/FlowiseAI/Flowise',
    source: 'GitHub Trending'
  },
  {
    name: 'Dify',
    description: 'LLM app development platform. Build, deploy, and manage AI applications with ease.',
    categories: ['Productivity'],
    external_url: 'https://github.com/langgenius/dify',
    source: 'GitHub Trending'
  },
  {
    name: 'OpenWebUI',
    description: 'Feature-rich LLM UI. Self-hosted ChatGPT alternative with advanced features.',
    categories: ['Productivity'],
    external_url: 'https://github.com/open-webui/open-webui',
    source: 'GitHub Trending'
  },
  {
    name: 'AnythingLLM',
    description: 'All-in-one AI workspace. Private, secure RAG with any LLM and data source.',
    categories: ['Data', 'Security'],
    external_url: 'https://github.com/Mintplex-Labs/anything-llm',
    source: 'GitHub Trending'
  },
  {
    name: 'OpenInterpreter',
    description: 'Local LLM that can run code and execute commands. Natural language computer control.',
    categories: ['Productivity', 'Security'],
    external_url: 'https://github.com/OpenInterpreter/open-interpreter',
    source: 'GitHub Trending'
  },
  
  // Product Hunt AI Launches
  {
    name: 'Perplexity AI',
    description: 'AI-powered search engine. Get answers with citations from the web.',
    categories: ['Data', 'Productivity'],
    external_url: 'https://www.perplexity.ai',
    source: 'Product Hunt'
  },
  {
    name: 'Midjourney',
    description: 'AI art generator. Create stunning images from text descriptions.',
    categories: ['Data'],
    external_url: 'https://www.midjourney.com',
    source: 'Product Hunt'
  },
  {
    name: 'Notion AI',
    description: 'AI writing assistant for Notion. Summarize, rewrite, and generate content.',
    categories: ['Productivity'],
    external_url: 'https://www.notion.so',
    source: 'Product Hunt'
  },
  {
    name: 'Jasper',
    description: 'AI content platform for marketing teams. Create blogs, ads, and social posts.',
    categories: ['Productivity'],
    external_url: 'https://www.jasper.ai',
    source: 'Product Hunt'
  },
  {
    name: 'Runway ML',
    description: 'AI creative tools for video, image, and audio. Professional creative AI.',
    categories: ['Data'],
    external_url: 'https://runwayml.com',
    source: 'Product Hunt'
  },
  {
    name: 'Descript',
    description: 'AI video and audio editor. Edit media like text documents.',
    categories: ['Data', 'Productivity'],
    external_url: 'https://www.descript.com',
    source: 'Product Hunt'
  },
  {
    name: 'Grammarly',
    description: 'AI writing assistant. Grammar, tone, and clarity improvements.',
    categories: ['Productivity'],
    external_url: 'https://www.grammarly.com',
    source: 'Product Hunt'
  },
  {
    name: 'Copy.ai',
    description: 'AI copywriting platform. Generate marketing copy in seconds.',
    categories: ['Productivity'],
    external_url: 'https://www.copy.ai',
    source: 'Product Hunt'
  },
  {
    name: 'Synthesia',
    description: 'AI video generation platform. Create videos from text with AI avatars.',
    categories: ['Data'],
    external_url: 'https://www.synthesia.io',
    source: 'Product Hunt'
  },
  {
    name: 'Murf AI',
    description: 'AI voice generator. Convert text to natural-sounding speech.',
    categories: ['Data'],
    external_url: 'https://murf.ai',
    source: 'Product Hunt'
  },
  
  // More GitHub AI Projects
  {
    name: 'Ollama',
    description: 'Run LLMs locally. Simple, efficient local LLM serving.',
    categories: ['Data', 'Security'],
    external_url: 'https://github.com/ollama/ollama',
    source: 'GitHub Trending'
  },
  {
    name: 'Continue',
    description: 'Open-source VS Code extension for AI coding. GitHub Copilot alternative.',
    categories: ['Productivity'],
    external_url: 'https://github.com/continuedev/continue',
    source: 'GitHub Trending'
  },
  {
    name: 'Tabnine',
    description: 'AI code completion. Full-stack code suggestions for developers.',
    categories: ['Productivity'],
    external_url: 'https://www.tabnine.com',
    source: 'GitHub Trending'
  },
  {
    name: 'Codeium',
    description: 'Free AI code assistant. Fast, accurate code completion.',
    categories: ['Productivity'],
    external_url: 'https://codeium.com',
    source: 'GitHub Trending'
  },
  {
    name: 'Cursor',
    description: 'AI-first code editor. Build software faster with AI assistance.',
    categories: ['Productivity'],
    external_url: 'https://cursor.sh',
    source: 'GitHub Trending'
  },
  {
    name: 'Replit AI',
    description: 'AI-powered IDE. Code, run, and deploy from the browser.',
    categories: ['Productivity'],
    external_url: 'https://replit.com',
    source: 'GitHub Trending'
  },
  {
    name: 'Hugging Face',
    description: 'AI model hub. Discover, train, and deploy ML models.',
    categories: ['Data'],
    external_url: 'https://huggingface.co',
    source: 'GitHub Trending'
  },
  {
    name: 'Stability AI',
    description: 'Open AI for everyone. Create images, audio, and 3D with AI.',
    categories: ['Data'],
    external_url: 'https://stability.ai',
    source: 'GitHub Trending'
  },
  {
    name: 'Anthropic Claude',
    description: 'Safe, helpful AI assistant. Large language model for complex tasks.',
    categories: ['Productivity', 'Data'],
    external_url: 'https://www.anthropic.com',
    source: 'GitHub Trending'
  },
  {
    name: 'Cohere',
    description: 'Enterprise AI platform. NLP models for business applications.',
    categories: ['Data'],
    external_url: 'https://cohere.ai',
    source: 'GitHub Trending'
  },
  
  // Additional AI Tools
  {
    name: 'ElevenLabs',
    description: 'AI voice synthesis. Realistic text-to-speech and voice cloning.',
    categories: ['Data'],
    external_url: 'https://elevenlabs.io',
    source: 'AI Agents Directory'
  },
  {
    name: 'Rivian AI',
    description: 'AI-powered customer support. Automate support tickets and chats.',
    categories: ['Productivity'],
    external_url: 'https://rivian.ai',
    source: 'AI Agents Directory'
  },
  {
    name: 'Phind',
    description: 'AI search for developers. Get code answers and explanations.',
    categories: ['Productivity'],
    external_url: 'https://www.phind.com',
    source: 'AI Agents Directory'
  },
  {
    name: 'Devin AI',
    description: 'First AI software engineer. Autonomous coding agent.',
    categories: ['Productivity'],
    external_url: 'https://www.cognition-labs.com',
    source: 'AI Agents Directory'
  },
  {
    name: 'Galileo AI',
    description: 'AI design tool. Generate UI designs from text prompts.',
    categories: ['Data'],
    external_url: 'https://www.usegalileo.ai',
    source: 'AI Agents Directory'
  },
  {
    name: 'Framer AI',
    description: 'AI website builder. Create professional websites instantly.',
    categories: ['Productivity'],
    external_url: 'https://www.framer.com',
    source: 'AI Agents Directory'
  },
  {
    name: 'Gamma',
    description: 'AI presentation maker. Create beautiful slides in minutes.',
    categories: ['Productivity'],
    external_url: 'https://gamma.app',
    source: 'AI Agents Directory'
  },
  {
    name: 'Tome',
    description: 'AI storytelling platform. Create narrative presentations.',
    categories: ['Productivity'],
    external_url: 'https://tome.app',
    source: 'AI Agents Directory'
  },
  {
    name: 'Murf Studio',
    description: 'AI voiceover generator. Professional voiceovers for videos.',
    categories: ['Data'],
    external_url: 'https://murf.ai',
    source: 'AI Agents Directory'
  },
  {
    name: 'Synthesys',
    description: 'AI video creation platform. Generate videos with AI avatars.',
    categories: ['Data'],
    external_url: 'https://synthesys.io',
    source: 'AI Agents Directory'
  },
  
  // More Community Agents
  {
    name: 'Zapier AI',
    description: 'AI automation platform. Connect apps and automate workflows.',
    categories: ['Productivity'],
    external_url: 'https://zapier.com',
    source: 'AI Agents Directory'
  },
  {
    name: 'Make AI',
    description: 'Visual automation platform. Build complex workflows with AI.',
    categories: ['Productivity'],
    external_url: 'https://www.make.com',
    source: 'AI Agents Directory'
  },
  {
    name: 'Airtable AI',
    description: 'AI-powered database. Smart fields and automations.',
    categories: ['Data', 'Productivity'],
    external_url: 'https://airtable.com',
    source: 'AI Agents Directory'
  },
  {
    name: 'Monday.com AI',
    description: 'Work operating system with AI. Manage projects and teams.',
    categories: ['Productivity'],
    external_url: 'https://monday.com',
    source: 'AI Agents Directory'
  },
  {
    name: 'Asana Intelligence',
    description: 'AI project management. Smart task suggestions and insights.',
    categories: ['Productivity'],
    external_url: 'https://asana.com',
    source: 'AI Agents Directory'
  },
  {
    name: 'Slack AI',
    description: 'AI-powered collaboration. Summarize channels and find info.',
    categories: ['Productivity'],
    external_url: 'https://slack.com',
    source: 'AI Agents Directory'
  },
  {
    name: 'Microsoft Copilot',
    description: 'AI assistant for Microsoft 365. Productivity across Office apps.',
    categories: ['Productivity'],
    external_url: 'https://copilot.microsoft.com',
    source: 'AI Agents Directory'
  },
  {
    name: 'Google Duet AI',
    description: 'AI for Google Workspace. Smart features in Docs, Sheets, Slides.',
    categories: ['Productivity'],
    external_url: 'https://workspace.google.com',
    source: 'AI Agents Directory'
  },
  {
    name: 'Salesforce Einstein',
    description: 'AI for CRM. Predictive insights and automation.',
    categories: ['Data', 'Productivity'],
    external_url: 'https://www.salesforce.com',
    source: 'AI Agents Directory'
  },
  {
    name: 'HubSpot AI',
    description: 'AI for marketing and sales. Smart content and automation.',
    categories: ['Productivity'],
    external_url: 'https://www.hubspot.com',
    source: 'AI Agents Directory'
  }
];

function seedCommunityAgents() {
  console.log('[Seed] Starting community agent seeding...');
  
  // Clear existing community listings
  const clearStmt = db.prepare('DELETE FROM agents WHERE community_listing = 1');
  const cleared = clearStmt.run();
  console.log(`[Seed] Cleared ${cleared.changes} existing community listings`);
  
  // Clear agent_categories for community agents
  db.exec('DELETE FROM agent_categories WHERE agent_id IN (SELECT id FROM agents WHERE community_listing = 1)');
  
  // Insert new community agents
  const insertAgent = db.prepare(`
    INSERT INTO agents (
      operator_id, name, description, capabilities, endpoint_url, pricing,
      status, community_listing, claim_url, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const insertCategory = db.prepare(`
    INSERT INTO agent_categories (agent_id, category_id) VALUES (?, ?)
  `);
  
  let inserted = 0;
  
  COMMUNITY_AGENTS.forEach(agent => {
    try {
      const now = Date.now();
      const result = insertAgent.run(
        null, // operator_id = null for community listings
        agent.name,
        agent.description,
        JSON.stringify([]), // capabilities
        agent.external_url, // endpoint_url as external URL
        'Free', // pricing
        'pending', // status
        1, // community_listing = 1
        agent.external_url, // claim_url
        now,
        now
      );
      
      // Add categories
      agent.categories.forEach(catName => {
        const cat = db.get('SELECT id FROM categories WHERE name = ?', [catName]);
        if (cat) {
          insertCategory.run(result.lastInsertRowid, cat.id);
        }
      });
      
      inserted++;
      console.log(`[Seed] ✓ Added: ${agent.name} (${agent.source})`);
    } catch (err) {
      console.error(`[Seed] ✗ Failed ${agent.name}:`, err.message);
    }
  });
  
  console.log(`[Seed] Completed: ${inserted}/${COMMUNITY_AGENTS.length} agents seeded`);
  
  // Show summary
  const total = db.get('SELECT COUNT(*) as count FROM agents WHERE community_listing = 1');
  console.log(`[Seed] Total community listings: ${total.count}`);
  
  // List all categories
  const categories = db.all('SELECT name FROM categories ORDER BY name');
  console.log(`[Seed] Available categories: ${categories.map(c => c.name).join(', ')}`);
}

// Run
seedCommunityAgents();