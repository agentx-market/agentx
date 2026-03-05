#!/usr/bin/env node
/**
 * Seed 50+ agent listings from public directories
 * Creates 'community listings' with 'Claim this listing' button
 */

const fs = require('fs');
const path = require('path');
const db = require('../db');

// Agent data from public sources
const agents = [
  // GitHub Trending AI Repos
  {
    name: 'LangChain',
    description: 'Build contextual AI applications with LangChain. Framework for developing LLM-powered apps.',
    category: 'Development Framework',
    external_url: 'https://github.com/langchain-ai/langchain',
    source: 'GitHub'
  },
  {
    name: 'LlamaIndex',
    description: 'Data framework for LLM applications. Ingest, structure, and access your data.',
    category: 'Data Framework',
    external_url: 'https://github.com/run-llama/llama_index',
    source: 'GitHub'
  },
  {
    name: 'AutoGen',
    description: 'Multi-agent conversation framework for building AI applications.',
    category: 'Multi-Agent',
    external_url: 'https://github.com/microsoft/autogen',
    source: 'GitHub'
  },
  {
    name: 'Flowise',
    description: 'Build LLM apps visually with drag-and-drop. Low-code LangChain UI.',
    category: 'No-Code Builder',
    external_url: 'https://github.com/FlowiseAI/Flowise',
    source: 'GitHub'
  },
  {
    name: 'Dify',
    description: 'LLM app development platform. Build, deploy, and manage AI applications.',
    category: 'Development Platform',
    external_url: 'https://github.com/langgenius/dify',
    source: 'GitHub'
  },
  {
    name: 'OpenWebUI',
    description: 'Feature-rich LLM UI. Self-hosted ChatGPT alternative.',
    category: 'Chat Interface',
    external_url: 'https://github.com/open-webui/open-webui',
    source: 'GitHub'
  },
  {
    name: 'AnythingLLM',
    description: 'All-in-one AI workspace. RAG, chat, and document management.',
    category: 'Knowledge Base',
    external_url: 'https://github.com/Mintplex-Labs/anything-llm',
    source: 'GitHub'
  },
  {
    name: 'Chatbot UI',
    description: 'Open-source ChatGPT UI. Beautiful, feature-rich interface.',
    category: 'Chat Interface',
    external_url: 'https://github.com/mckaywrigley/chatbot-ui',
    source: 'GitHub'
  },
  {
    name: 'OpenInterpreter',
    description: 'Run code locally with LLMs. Natural language computer control.',
    category: 'Automation',
    external_url: 'https://github.com/OpenInterpreter/open-interpreter',
    source: 'GitHub'
  },
  {
    name: 'Continue',
    description: 'Open-source AI code assistant. VS Code and JetBrains extension.',
    category: 'Code Assistant',
    external_url: 'https://github.com/continuedev/continue',
    source: 'GitHub'
  },
  {
    name: 'Cursor',
    description: 'AI-first code editor. Build software faster with AI assistance.',
    category: 'Code Editor',
    external_url: 'https://www.cursor.com',
    source: 'Product Hunt'
  },
  {
    name: 'Replit AI',
    description: 'AI-powered IDE. Code, run, and deploy from browser.',
    category: 'Development Platform',
    external_url: 'https://replit.com/site/ai',
    source: 'Product Hunt'
  },
  {
    name: 'GitHub Copilot',
    description: 'Your AI pair programmer. Code completion and suggestions.',
    category: 'Code Assistant',
    external_url: 'https://github.com/features/copilot',
    source: 'Directory'
  },
  {
    name: 'Tabnine',
    description: 'AI code completion for all developers. Supports any IDE.',
    category: 'Code Assistant',
    external_url: 'https://www.tabnine.com',
    source: 'Directory'
  },
  {
    name: 'Codeium',
    description: 'Free AI coding assistant. Code completion and chat.',
    category: 'Code Assistant',
    external_url: 'https://codeium.com',
    source: 'Directory'
  },
  {
    name: 'Devin',
    description: 'AI software engineer. Autonomous coding agent.',
    category: 'Software Engineer',
    external_url: 'https://www.cognition-labs.com/introducing-devin',
    source: 'Product Hunt'
  },
  {
    name: 'Cognition',
    description: 'Building general AI workers for software tasks.',
    category: 'General AI',
    external_url: 'https://www.cognition-labs.com',
    source: 'Directory'
  },
  {
    name: 'Perplexity AI',
    description: 'AI-powered search engine. Get answers with citations.',
    category: 'Search',
    external_url: 'https://www.perplexity.ai',
    source: 'Directory'
  },
  {
    name: 'You.com',
    description: 'AI search engine with chat and code execution.',
    category: 'Search',
    external_url: 'https://you.com',
    source: 'Directory'
  },
  {
    name: 'Phind',
    description: 'AI search engine for developers. Code-focused answers.',
    category: 'Search',
    external_url: 'https://www.phind.com',
    source: 'Directory'
  },
  {
    name: 'Midjourney',
    description: 'AI art generator. Create stunning images from text.',
    category: 'Image Generation',
    external_url: 'https://www.midjourney.com',
    source: 'Directory'
  },
  {
    name: 'DALL-E 3',
    description: 'AI image generation by OpenAI. Text to images.',
    category: 'Image Generation',
    external_url: 'https://openai.com/dall-e-3',
    source: 'Directory'
  },
  {
    name: 'Stable Diffusion',
    description: 'Open-source AI image generation model.',
    category: 'Image Generation',
    external_url: 'https://stability.ai/stable-diffusion',
    source: 'GitHub'
  },
  {
    name: 'Runway ML',
    description: 'AI creative tools for video, image, and audio.',
    category: 'Creative Tools',
    external_url: 'https://runwayml.com',
    source: 'Directory'
  },
  {
    name: 'Descript',
    description: 'AI video and audio editing. Edit media like text.',
    category: 'Media Editing',
    external_url: 'https://www.descript.com',
    source: 'Directory'
  },
  {
    name: 'ElevenLabs',
    description: 'AI voice generation and cloning. Realistic text-to-speech.',
    category: 'Voice',
    external_url: 'https://elevenlabs.io',
    source: 'Directory'
  },
  {
    name: 'Rask AI',
    description: 'AI video dubbing and localization. Translate videos.',
    category: 'Video',
    external_url: 'https://rask.ai',
    source: 'Product Hunt'
  },
  {
    name: 'Synthesia',
    description: 'AI video generation with avatars. Create videos from text.',
    category: 'Video',
    external_url: 'https://www.synthesia.io',
    source: 'Directory'
  },
  {
    name: 'HeyGen',
    description: 'AI video generator with avatars and voice cloning.',
    category: 'Video',
    external_url: 'https://www.heygen.com',
    source: 'Directory'
  },
  {
    name: 'Jasper',
    description: 'AI content creation for marketing and business.',
    category: 'Content Writing',
    external_url: 'https://www.jasper.ai',
    source: 'Directory'
  },
  {
    name: 'Copy.ai',
    description: 'AI copywriting tool for marketing content.',
    category: 'Content Writing',
    external_url: 'https://www.copy.ai',
    source: 'Directory'
  },
  {
    name: 'Writesonic',
    description: 'AI writing assistant for articles and ads.',
    category: 'Content Writing',
    external_url: 'https://writesonic.com',
    source: 'Directory'
  },
  {
    name: 'Notion AI',
    description: 'AI workspace assistant. Write, summarize, and organize.',
    category: 'Productivity',
    external_url: 'https://www.notion.so/product/ai',
    source: 'Directory'
  },
  {
    name: 'Mem',
    description: 'AI-powered note-taking app. Auto-organizes thoughts.',
    category: 'Productivity',
    external_url: 'https://www.mem.ai',
    source: 'Product Hunt'
  },
  {
    name: 'Otter.ai',
    description: 'AI meeting assistant. Transcribe and summarize meetings.',
    category: 'Transcription',
    external_url: 'https://otter.ai',
    source: 'Directory'
  },
  {
    name: 'Fireflies.ai',
    description: 'AI meeting notes and transcription. Integrates with Zoom, Teams.',
    category: 'Transcription',
    external_url: 'https://www.fireflies.ai',
    source: 'Directory'
  },
  {
    name: 'Grain',
    description: 'AI meeting intelligence. Record, transcribe, and analyze.',
    category: 'Transcription',
    external_url: 'https://www.grain.com',
    source: 'Directory'
  },
  {
    name: 'Zapier AI',
    description: 'Automate workflows with AI. Connect 5000+ apps.',
    category: 'Automation',
    external_url: 'https://zapier.com/ai',
    source: 'Directory'
  },
  {
    name: 'Make AI',
    description: 'Visual automation platform with AI capabilities.',
    category: 'Automation',
    external_url: 'https://www.make.com/en/ai',
    source: 'Directory'
  },
  {
    name: 'n8n AI',
    description: 'Workflow automation with AI nodes. Self-hostable.',
    category: 'Automation',
    external_url: 'https://n8n.io',
    source: 'GitHub'
  },
  {
    name: 'Hugging Face',
    description: 'AI model hub and development platform. 500K+ models.',
    category: 'Model Hub',
    external_url: 'https://huggingface.co',
    source: 'Directory'
  },
  {
    name: 'Replicate',
    description: 'Run AI models in the cloud. Simple API for ML.',
    category: 'Model Hosting',
    external_url: 'https://replicate.com',
    source: 'Directory'
  },
  {
    name: 'Banana.dev',
    description: 'Serverless GPU cloud for ML model deployment.',
    category: 'Model Hosting',
    external_url: 'https://banana.dev',
    source: 'Directory'
  },
  {
    name: 'Modal',
    description: 'Serverless compute for Python. Run ML workloads.',
    category: 'Model Hosting',
    external_url: 'https://modal.com',
    source: 'Product Hunt'
  },
  {
    name: 'Vercel AI SDK',
    description: 'Build AI chatbots and streaming responses.',
    category: 'Development Framework',
    external_url: 'https://sdk.vercel.ai',
    source: 'GitHub'
  },
  {
    name: 'LlamaCloud',
    description: 'Managed RAG infrastructure for LLM applications.',
    category: 'Data Framework',
    external_url: 'https://www.llamaindex.ai/llamacloud',
    source: 'Product Hunt'
  },
  {
    name: 'Pinecone',
    description: 'Vector database for AI applications. Semantic search.',
    category: 'Vector Database',
    external_url: 'https://www.pinecone.io',
    source: 'Directory'
  },
  {
    name: 'Weaviate',
    description: 'Open-source vector database. ML-native data store.',
    category: 'Vector Database',
    external_url: 'https://weaviate.io',
    source: 'GitHub'
  },
  {
    name: 'Qdrant',
    description: 'Vector search engine. Real-time vector matching.',
    category: 'Vector Database',
    external_url: 'https://qdrant.tech',
    source: 'GitHub'
  },
  {
    name: 'Milvus',
    description: 'Cloud-native vector database for AI applications.',
    category: 'Vector Database',
    external_url: 'https://milvus.io',
    source: 'GitHub'
  }
];

async function seedAgents() {
  console.log('🌱 Seeding agents from public directories...');
  
  // Get or create 'Community' category
  const communityCategory = db.prepare(`
    INSERT OR IGNORE INTO categories (name, slug, description)
    VALUES ('Community', 'community', 'Agents curated from public directories')
  `).run();
  
  const categoryResult = db.prepare('SELECT id FROM categories WHERE slug = ?').get('community');
  const categoryId = categoryResult ? categoryResult.id : null;
  
  let inserted = 0;
  let updated = 0;
  
  for (const agent of agents) {
    const slug = agent.name.toLowerCase().replace(/ /g, '-');
    
    // Check if agent already exists
    const existing = db.prepare('SELECT id FROM agents WHERE LOWER(name) = LOWER(?)').get(agent.name);
    
    if (existing) {
      // Update existing agent
      db.prepare(`
        UPDATE agents SET
          description = ?,
          endpoint_url = ?,
          status = 'pending',
          updated_at = ?
        WHERE id = ?
      `).run(agent.description, agent.external_url, Date.now(), existing.id);
      
      // Update category
      if (categoryId) {
        db.prepare(`
          INSERT OR IGNORE INTO agent_categories (agent_id, category_id)
          VALUES (?, ?)
        `).run(existing.id, categoryId);
      }
      
      updated++;
      console.log(`  ✅ Updated: ${agent.name}`);
    } else {
      // Insert new agent
      const result = db.prepare(`
        INSERT INTO agents (name, description, endpoint_url, status, created_at, updated_at)
        VALUES (?, ?, ?, 'pending', ?, ?)
      `).run(agent.name, agent.description, agent.external_url, Date.now(), Date.now());
      
      // Assign to Community category
      if (categoryId) {
        db.prepare(`
          INSERT INTO agent_categories (agent_id, category_id)
          VALUES (?, ?)
        `).run(result.lastInsertRowid, categoryId);
      }
      
      inserted++;
      console.log(`  ✅ Created: ${agent.name}`);
    }
  }
  
  console.log(`\n✨ Seeding complete!`);
  console.log(`   Created: ${inserted} new agents`);
  console.log(`   Updated: ${updated} existing agents`);
  console.log(`   Total: ${agents.length} agents in database`);
  
  return { inserted, updated, total: agents.length };
}

// Run seeding
seedAgents().catch(console.error);