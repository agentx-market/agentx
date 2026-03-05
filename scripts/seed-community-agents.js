#!/usr/bin/env node
/**
 * Seed 50+ agent listings from public directories
 * Creates 'community listings' with Claim this listing button
 */

const fs = require('fs');
const path = require('path');
const db = require('../db');
const Database = require('better-sqlite3');

// Agent data from public sources
const communityAgents = [
  // GitHub Trending AI Repos
  {
    name: 'LangChain',
    description: 'Build contextual AI applications with LLMs. Framework for developing applications powered by language models.',
    category: 'Development Framework',
    externalUrl: 'https://github.com/langchain-ai/langchain',
    source: 'GitHub Trending'
  },
  {
    name: 'LlamaIndex',
    description: 'Data framework for your LLM applications. Ingest, structure, and access your unstructured data.',
    category: 'Data Framework',
    externalUrl: 'https://github.com/run-llama/llama_index',
    source: 'GitHub Trending'
  },
  {
    name: 'AutoGen',
    description: 'A programming framework for building AI agents and multi-agent conversations.',
    category: 'Agent Framework',
    externalUrl: 'https://github.com/microsoft/autogen',
    source: 'GitHub Trending'
  },
  {
    name: 'CrewAI',
    description: 'Framework for orchestrating role-playing AI agents.',
    category: 'Agent Framework',
    externalUrl: 'https://github.com/crewAIInc/crewAI',
    source: 'GitHub Trending'
  },
  {
    name: 'Flowise',
    description: 'Build LLM apps visually with drag & drop.',
    category: 'No-Code Builder',
    externalUrl: 'https://github.com/FlowiseAI/Flowise',
    source: 'GitHub Trending'
  },
  {
    name: 'Dify',
    description: 'LLM app development platform. All-in-one platform for AI native app development.',
    category: 'Development Platform',
    externalUrl: 'https://github.com/langgenius/dify',
    source: 'GitHub Trending'
  },
  {
    name: 'OpenWebUI',
    description: 'Feature-rich AI chat interface. Runs anywhere, supports any model.',
    category: 'Chat Interface',
    externalUrl: 'https://github.com/open-webui/open-webui',
    source: 'GitHub Trending'
  },
  {
    name: 'AnythingLLM',
    description: 'One-stop all-in-one AI workspace. RAG, chatbots, agents in one desktop app.',
    category: 'Knowledge Base',
    externalUrl: 'https://github.com/Mintplex-Labs/anything-llm',
    source: 'GitHub Trending'
  },
  {
    name: 'Chatbot UI',
    description: 'Powerful AI chat interface with multi-model support.',
    category: 'Chat Interface',
    externalUrl: 'https://github.com/mckaywrigley/chatbot-ui',
    source: 'GitHub Trending'
  },
  {
    name: 'Open Interpreter',
    description: 'Run code naturally. AI that can execute code on your computer.',
    category: 'Code Execution',
    externalUrl: 'https://github.com/OpenInterpreter/open-interpreter',
    source: 'GitHub Trending'
  },
  {
    name: 'SmolAgent',
    description: 'Minimal framework for building AI agents. 500 lines of code.',
    category: 'Agent Framework',
    externalUrl: 'https://github.com/huggingface/smolagents',
    source: 'GitHub Trending'
  },
  {
    name: 'LiteLLM',
    description: 'Proxy server to call all LLM APIs. Unified API for 100+ LLM providers.',
    category: 'API Gateway',
    externalUrl: 'https://github.com/BerriAI/litellm',
    source: 'GitHub Trending'
  },
  {
    name: 'Voyager',
    description: 'Open-ended AI agent for Minecraft. Learns to survive and thrive.',
    category: 'Gaming Agent',
    externalUrl: 'https://github.com/OpenVoyagerTeam/Voyager',
    source: 'GitHub Trending'
  },
  {
    name: 'OpenHands',
    description: 'Open source software developer agent. Can code, debug, and deploy.',
    category: 'Code Assistant',
    externalUrl: 'https://github.com/All-Hands-AI/OpenHands',
    source: 'GitHub Trending'
  },
  {
    name: 'Devika',
    description: 'Open source AI software engineer. Plans and executes coding tasks.',
    category: 'Code Assistant',
    externalUrl: 'https://github.com/stitionai/devika',
    source: 'GitHub Trending'
  },
  
  // Product Hunt AI Launches
  {
    name: 'Cursor',
    description: 'AI-first code editor. Built for pair programming with AI.',
    category: 'Code Assistant',
    externalUrl: 'https://cursor.sh',
    source: 'Product Hunt'
  },
  {
    name: 'Replit AI',
    description: 'Full-stack AI pair programmer. Build apps with natural language.',
    category: 'Code Assistant',
    externalUrl: 'https://replit.com/site/ai',
    source: 'Product Hunt'
  },
  {
    name: 'Gamma',
    description: 'AI presentation and document creator. Beautiful decks in seconds.',
    category: 'Content Creation',
    externalUrl: 'https://gamma.app',
    source: 'Product Hunt'
  },
  {
    name: 'Notion AI',
    description: 'AI workspace assistant. Write, organize, and summarize in Notion.',
    category: 'Productivity',
    externalUrl: 'https://www.notion.so/product/ai',
    source: 'Product Hunt'
  },
  {
    name: 'Jasper',
    description: 'AI content platform for marketing teams. Create blogs, ads, and more.',
    category: 'Content Creation',
    externalUrl: 'https://www.jasper.ai',
    source: 'Product Hunt'
  },
  {
    name: 'Descript',
    description: 'All-in-one audio and video editing with AI overdub.',
    category: 'Media Production',
    externalUrl: 'https://www.descript.com',
    source: 'Product Hunt'
  },
  {
    name: 'Runway',
    description: 'AI video generation and editing tools for creators.',
    category: 'Media Production',
    externalUrl: 'https://runwayml.com',
    source: 'Product Hunt'
  },
  {
    name: 'Midjourney',
    description: 'AI image generation from text prompts. Create stunning visuals.',
    category: 'Image Generation',
    externalUrl: 'https://www.midjourney.com',
    source: 'Product Hunt'
  },
  {
    name: 'ElevenLabs',
    description: 'AI voice generation and cloning. Realistic text-to-speech.',
    category: 'Voice AI',
    externalUrl: 'https://elevenlabs.io',
    source: 'Product Hunt'
  },
  {
    name: 'Copy.ai',
    description: 'AI copywriting for marketing, sales, and content teams.',
    category: 'Content Creation',
    externalUrl: 'https://www.copy.ai',
    source: 'Product Hunt'
  },
  {
    name: 'Framer AI',
    description: 'AI website builder. Design and publish sites with natural language.',
    category: 'No-Code Builder',
    externalUrl: 'https://www.framer.com/ai',
    source: 'Product Hunt'
  },
  {
    name: 'Relume',
    description: 'AI sitemap and wireframe generator for web design.',
    category: 'No-Code Builder',
    externalUrl: 'https://relume.io',
    source: 'Product Hunt'
  },
  {
    name: 'Tome',
    description: 'AI storytelling platform. Create narrative presentations.',
    category: 'Content Creation',
    externalUrl: 'https://tome.app',
    source: 'Product Hunt'
  },
  {
    name: 'Synthesia',
    description: 'AI video avatars. Create professional videos without cameras.',
    category: 'Media Production',
    externalUrl: 'https://www.synthesia.io',
    source: 'Product Hunt'
  },
  {
    name: 'Murf',
    description: 'AI voice generator for videos, podcasts, and presentations.',
    category: 'Voice AI',
    externalUrl: 'https://murf.ai',
    source: 'Product Hunt'
  },
  
  // AI Agents Directory
  {
    name: 'Character.AI',
    description: 'Chat with AI characters. Create your own personalities.',
    category: 'Chat Assistant',
    externalUrl: 'https://character.ai',
    source: 'AI Agents Directory'
  },
  {
    name: 'Pi',
    description: 'AI personal assistant focused on empathetic conversations.',
    category: 'Chat Assistant',
    externalUrl: 'https://pi.ai',
    source: 'AI Agents Directory'
  },
  {
    name: 'Claude',
    description: 'Anthropic AI assistant for complex reasoning and analysis.',
    category: 'Chat Assistant',
    externalUrl: 'https://claude.ai',
    source: 'AI Agents Directory'
  },
  {
    name: 'Perplexity',
    description: 'AI search engine with citations. Find answers with sources.',
    category: 'Search Assistant',
    externalUrl: 'https://www.perplexity.ai',
    source: 'AI Agents Directory'
  },
  {
    name: 'Consensus',
    description: 'AI research assistant. Find answers from scientific papers.',
    category: 'Research Assistant',
    externalUrl: 'https://www.consensus.app',
    source: 'AI Agents Directory'
  },
  {
    name: 'Elicit',
    description: 'AI research assistant for literature reviews and synthesis.',
    category: 'Research Assistant',
    externalUrl: 'https://elicit.com',
    source: 'AI Agents Directory'
  },
  {
    name: 'Wolfram Alpha',
    description: 'Computational knowledge engine. Answer factual queries.',
    category: 'Knowledge Engine',
    externalUrl: 'https://www.wolframalpha.com',
    source: 'AI Agents Directory'
  },
  {
    name: 'Otter.ai',
    description: 'AI meeting assistant. Transcribe and summarize conversations.',
    category: 'Productivity',
    externalUrl: 'https://otter.ai',
    source: 'AI Agents Directory'
  },
  {
    name: 'Fireflies.ai',
    description: 'AI meeting notes and transcription for teams.',
    category: 'Productivity',
    externalUrl: 'https://www.fireflies.ai',
    source: 'AI Agents Directory'
  },
  {
    name: 'Motion',
    description: 'AI calendar and task manager. Auto-schedules your day.',
    category: 'Productivity',
    externalUrl: 'https://www.motion.app',
    source: 'AI Agents Directory'
  },
  {
    name: 'Tome AI',
    description: 'AI-powered storytelling and presentation tool.',
    category: 'Content Creation',
    externalUrl: 'https://tome.app',
    source: 'AI Agents Directory'
  },
  {
    name: 'Hugging Chat',
    description: 'Open source AI chat with access to 100+ models.',
    category: 'Chat Assistant',
    externalUrl: 'https://huggingface.co/chat',
    source: 'AI Agents Directory'
  },
  {
    name: 'Poe',
    description: 'Chat with multiple AI bots in one place. Quora AI platform.',
    category: 'Chat Assistant',
    externalUrl: 'https://poe.com',
    source: 'AI Agents Directory'
  },
  {
    name: 'You.com',
    description: 'AI search engine with chat interface and code execution.',
    category: 'Search Assistant',
    externalUrl: 'https://you.com',
    source: 'AI Agents Directory'
  },
  {
    name: 'Phind',
    description: 'AI search engine for developers. Code-focused answers.',
    category: 'Search Assistant',
    externalUrl: 'https://www.phind.com',
    source: 'AI Agents Directory'
  },
  
  // More GitHub & Community
  {
    name: 'BabyAGI',
    description: 'Task-driven autonomous AI agent. Goal-oriented task management.',
    category: 'Agent Framework',
    externalUrl: 'https://github.com/yoheinakajima/babyagi',
    source: 'GitHub Trending'
  },
  {
    name: 'LangGraph',
    description: 'Build stateful, multi-actor applications with LLMs.',
    category: 'Agent Framework',
    externalUrl: 'https://github.com/langchain-ai/langgraph',
    source: 'GitHub Trending'
  },
  {
    name: 'CAMEL',
    description: 'Communicative AI agents for studying human-like agent behaviors.',
    category: 'Agent Framework',
    externalUrl: 'https://github.com/camel-ai/camel',
    source: 'GitHub Trending'
  },
  {
    name: 'GPT Engineer',
    description: 'AI software engineer. Generate codebases from requirements.',
    category: 'Code Assistant',
    externalUrl: 'https://github.com/gpt-engineer-org/gpt-engineer',
    source: 'GitHub Trending'
  },
  {
    name: 'Aider',
    description: 'AI pair programmer for your terminal. Edit code with chat.',
    category: 'Code Assistant',
    externalUrl: 'https://github.com/paul-gauthier/aider',
    source: 'GitHub Trending'
  },
  {
    name: 'Continue',
    description: 'Open source VS Code extension for AI pair programming.',
    category: 'Code Assistant',
    externalUrl: 'https://github.com/continuedev/continue',
    source: 'GitHub Trending'
  },
  {
    name: 'Tabnine',
    description: 'AI code completion for all major IDEs. Private and secure.',
    category: 'Code Assistant',
    externalUrl: 'https://www.tabnine.com',
    source: 'GitHub Trending'
  },
  {
    name: 'GitHub Copilot',
    description: 'AI pair programmer from GitHub and OpenAI. Code faster.',
    category: 'Code Assistant',
    externalUrl: 'https://github.com/features/copilot',
    source: 'GitHub Trending'
  },
  {
    name: 'Amazon Q',
    description: 'AI coding assistant from AWS. Build, run, and debug apps.',
    category: 'Code Assistant',
    externalUrl: 'https://aws.amazon.com/q/',
    source: 'GitHub Trending'
  },
  {
    name: 'Codeium',
    description: 'Free AI code completion and chat for developers.',
    category: 'Code Assistant',
    externalUrl: 'https://codeium.com',
    source: 'GitHub Trending'
  },
  {
    name: 'Devin',
    description: 'AI software engineer by Cognition. Full-stack development.',
    category: 'Code Assistant',
    externalUrl: 'https://www.cognition.ai',
    source: 'Product Hunt'
  },
  {
    name: 'Replit Ghostwriter',
    description: 'AI coding assistant built into Replit IDE.',
    category: 'Code Assistant',
    externalUrl: 'https://replit.com/site/ghostwriter',
    source: 'Product Hunt'
  },
  {
    name: 'Windsurf',
    description: 'AI code editor with deep IDE integration.',
    category: 'Code Assistant',
    externalUrl: 'https://codeium.com/windsurf',
    source: 'Product Hunt'
  },
  {
    name: 'Bolt.new',
    description: 'Full-stack AI web app generator in browser.',
    category: 'No-Code Builder',
    externalUrl: 'https://bolt.new',
    source: 'Product Hunt'
  },
  {
    name: 'Lovable',
    description: 'AI app builder. Turn ideas into working apps instantly.',
    category: 'No-Code Builder',
    externalUrl: 'https://lovable.dev',
    source: 'Product Hunt'
  },
  {
    name: 'v0',
    description: 'AI-powered UI generator by Vercel. Generate React code.',
    category: 'No-Code Builder',
    externalUrl: 'https://v0.dev',
    source: 'Product Hunt'
  },
  {
    name: 'Durable',
    description: 'AI website builder for small businesses. Launch in 30 seconds.',
    category: 'No-Code Builder',
    externalUrl: 'https://durable.co',
    source: 'Product Hunt'
  },
  {
    name: 'Fliki',
    description: 'AI text-to-video with realistic voices. Create videos from text.',
    category: 'Media Production',
    externalUrl: 'https://fliki.ai',
    source: 'Product Hunt'
  },
  {
    name: 'Pictory',
    description: 'AI video creator from blog posts and articles.',
    category: 'Media Production',
    externalUrl: 'https://pictory.ai',
    source: 'Product Hunt'
  },
  {
    name: 'InVideo',
    description: 'AI video generator for social media and marketing.',
    category: 'Media Production',
    externalUrl: 'https://invideo.io',
    source: 'Product Hunt'
  },
  {
    name: 'Suno',
    description: 'AI music generation. Create songs with vocals and instruments.',
    category: 'Media Production',
    externalUrl: 'https://suno.com',
    source: 'Product Hunt'
  },
  {
    name: 'Udio',
    description: 'AI music creation platform. Generate original songs.',
    category: 'Media Production',
    externalUrl: 'https://www.udio.com',
    source: 'Product Hunt'
  },
  {
    name: 'Stable Diffusion',
    description: 'Open source AI image generation model. Create images from text.',
    category: 'Image Generation',
    externalUrl: 'https://stability.ai',
    source: 'Product Hunt'
  },
  {
    name: 'DALL-E 3',
    description: 'OpenAI image generation. Create images from descriptions.',
    category: 'Image Generation',
    externalUrl: 'https://openai.com/dall-e-3',
    source: 'Product Hunt'
  },
  {
    name: 'Leonardo',
    description: 'AI art generation platform for games and creative projects.',
    category: 'Image Generation',
    externalUrl: 'https://leonardo.ai',
    source: 'Product Hunt'
  },
  {
    name: 'Krea',
    description: 'AI image enhancement and generation. Upscale and create.',
    category: 'Image Generation',
    externalUrl: 'https://krea.ai',
    source: 'Product Hunt'
  },
  {
    name: 'Magic Studio',
    description: 'AI toolkit for creators. Write, design, and edit with AI.',
    category: 'Content Creation',
    externalUrl: 'https://magicstudio.com',
    source: 'Product Hunt'
  },
  {
    name: 'Writesonic',
    description: 'AI writing assistant for ads, articles, and emails.',
    category: 'Content Creation',
    externalUrl: 'https://writesonic.com',
    source: 'Product Hunt'
  },
  {
    name: 'Jasper Art',
    description: 'AI image generator for marketing visuals.',
    category: 'Image Generation',
    externalUrl: 'https://www.jasper.ai/art',
    source: 'Product Hunt'
  },
  {
    name: 'Canva AI',
    description: 'AI design tools for social media, presentations, and more.',
    category: 'No-Code Builder',
    externalUrl: 'https://www.canva.com/ai',
    source: 'Product Hunt'
  },
  {
    name: 'Gamma AI',
    description: 'AI presentation and document creation platform.',
    category: 'Content Creation',
    externalUrl: 'https://gamma.app',
    source: 'Product Hunt'
  },
  {
    name: 'Tome AI',
    description: 'AI storytelling for presentations and narratives.',
    category: 'Content Creation',
    externalUrl: 'https://tome.app',
    source: 'Product Hunt'
  },
  {
    name: 'Beautiful.ai',
    description: 'AI-powered presentation design. Smart templates.',
    category: 'No-Code Builder',
    externalUrl: 'https://www.beautiful.ai',
    source: 'Product Hunt'
  },
  {
    name: 'Prezi AI',
    description: 'AI presentation generator with dynamic zooming.',
    category: 'No-Code Builder',
    externalUrl: 'https://prezi.com',
    source: 'Product Hunt'
  },
  {
    name: 'Miro AI',
    description: 'AI-powered collaborative whiteboard for teams.',
    category: 'Productivity',
    externalUrl: 'https://miro.com',
    source: 'Product Hunt'
  },
  {
    name: 'Notion AI',
    description: 'AI workspace assistant for notes and knowledge.',
    category: 'Productivity',
    externalUrl: 'https://www.notion.so/product/ai',
    source: 'Product Hunt'
  },
  {
    name: 'Mem',
    description: 'AI-powered note-taking app. Auto-organizes your thoughts.',
    category: 'Productivity',
    externalUrl: 'https://mem.ai',
    source: 'Product Hunt'
  },
  {
    name: 'Obsidian AI',
    description: 'AI plugins for knowledge management and note-taking.',
    category: 'Productivity',
    externalUrl: 'https://obsidian.md',
    source: 'Product Hunt'
  },
  {
    name: 'Roam Research',
    description: 'Networked thought tool for knowledge management.',
    category: 'Productivity',
    externalUrl: 'https://roamresearch.com',
    source: 'Product Hunt'
  },
  {
    name: 'Logseq',
    description: 'Privacy-first knowledge base with AI plugins.',
    category: 'Productivity',
    externalUrl: 'https://logseq.com',
    source: 'Product Hunt'
  },
  {
    name: 'Zapier AI',
    description: 'AI automation for workflows and integrations.',
    category: 'Automation',
    externalUrl: 'https://zapier.com',
    source: 'Product Hunt'
  },
  {
    name: 'Make AI',
    description: 'Visual automation platform with AI capabilities.',
    category: 'Automation',
    externalUrl: 'https://www.make.com',
    source: 'Product Hunt'
  },
  {
    name: 'n8n AI',
    description: 'Workflow automation with AI node integrations.',
    category: 'Automation',
    externalUrl: 'https://n8n.io',
    source: 'Product Hunt'
  },
  {
    name: 'Bardeen',
    description: 'AI automation for repetitive web tasks.',
    category: 'Automation',
    externalUrl: 'https://www.bardeen.ai',
    source: 'Product Hunt'
  },
  {
    name: 'Baraja',
    description: 'AI-powered design collaboration platform.',
    category: 'Design Tool',
    externalUrl: 'https://baraja.app',
    source: 'Product Hunt'
  }
];

async function seedCommunityAgents() {
  console.log('🌱 Seeding community agents from public sources...');
  
  const conn = new Database(path.join(__dirname, '..', 'agentx.db'));
  
  // Get or create 'Community' category
  const categoryRow = conn.pragma("table_info('categories')").find(
    col => col.name === 'name'
  );
  
  let communityCategoryId;
  const existingCategory = conn
    .prepare('SELECT id FROM categories WHERE slug = ?')
    .get('community-listings');
  
  if (existingCategory) {
    communityCategoryId = existingCategory.id;
    console.log(`✅ Using existing category: Community Listings (ID: ${communityCategoryId})`);
  } else {
    conn.prepare(`
      INSERT INTO categories (name, slug, description)
      VALUES (?, ?, ?)
    `).run(
      'Community Listings',
      'community-listings',
      'Community-curated agent listings from public directories'
    );
    communityCategoryId = conn.lastInsertRowid;
    console.log('✅ Created category: Community Listings');
  }
  
  let inserted = 0;
  let updated = 0;
  
  for (const agent of communityAgents) {
    const slug = agent.name.toLowerCase().replace(/ /g, '-');
    
    // Check if agent already exists
    const existing = conn
      .prepare('SELECT id FROM agents WHERE endpoint_url = ?')
      .get([agent.externalUrl]);
    
    if (existing) {
      // Update existing
      conn.prepare(`
        UPDATE agents 
        SET name = ?, description = ?, updated_at = ?
        WHERE id = ?
      `).run([agent.name, agent.description, Date.now(), existing.id]);
      updated++;
    } else {
      // Insert new community listing
      const insertStmt = conn.prepare(`
        INSERT INTO agents (
          operator_id, name, description, endpoint_url, 
          status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'community', ?, ?)
      `);
      insertStmt.run(
        'community', // operator_id for community listings
        agent.name,
        agent.description,
        agent.externalUrl,
        Date.now(),
        Date.now()
      );
      
      const agentId = insertStmt.lastInsertRowid;
      
      // Link to category
      conn.prepare(`
        INSERT INTO agent_categories (agent_id, category_id)
        VALUES (?, ?)
      `).run([agentId, communityCategoryId]);
      
      inserted++;
    }
  }
  
  console.log(`✅ Seeded ${inserted} new agents, updated ${updated} existing`);
  const total = conn.prepare('SELECT COUNT(*) as count FROM agents WHERE operator_id = ?').get('community');
  console.log(`📊 Total community agents: ${total.count}`);
}

// Run if executed directly
if (require.main === module) {
  seedCommunityAgents();
}

module.exports = { seedCommunityAgents };