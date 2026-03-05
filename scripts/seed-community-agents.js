#!/usr/bin/env node
/**
 * Seed community agent listings from public directories
 * Creates skeleton listings with "Claim this listing" for operators to claim
 */

const db = require('../db');

// Community listings data from public sources
const communityAgents = [
  // GitHub Trending AI Repos
  {
    name: 'LangChain',
    description: 'Build contextual AI applications with LangChain framework',
    url: 'https://github.com/langchain-ai/langchain',
    category: 'Development Framework',
    capabilities: ['Chain orchestration', 'Memory management', 'Tool integration']
  },
  {
    name: 'LlamaIndex',
    description: 'Data framework for LLM applications to ingest, structure, and access private data',
    url: 'https://github.com/run-llama/llama_index',
    category: 'Development Framework',
    capabilities: ['Data indexing', 'RAG pipelines', 'Query engines']
  },
  {
    name: 'AutoGen',
    description: 'Framework for building multi-agent conversational systems',
    url: 'https://github.com/microsoft/autogen',
    category: 'Multi-Agent',
    capabilities: ['Multi-agent conversations', 'Code generation', 'Task automation']
  },
  {
    name: 'CrewAI',
    description: 'Framework for orchestrating role-playing AI agents',
    url: 'https://github.com/joaomdmoura/crewAI',
    category: 'Multi-Agent',
    capabilities: ['Role-playing agents', 'Task delegation', 'Collaborative workflows']
  },
  {
    name: 'Haystack',
    description: 'End-to-end LLM toolkits for building search and QA applications',
    url: 'https://github.com/deepset-ai/haystack',
    category: 'Development Framework',
    capabilities: ['Document search', 'Question answering', 'RAG pipelines']
  },
  {
    name: 'Semantic Kernel',
    description: 'SDK for integrating LLMs into traditional code',
    url: 'https://github.com/microsoft/semantic-kernel',
    category: 'Development Framework',
    capabilities: ['Plugin system', 'Orchestration', 'Memory management']
  },
  {
    name: 'Dify',
    description: 'LLM app development platform with visual workflow builder',
    url: 'https://github.com/langgenius/dify',
    category: 'Development Platform',
    capabilities: ['Visual workflow', 'API management', 'Observability']
  },
  {
    name: 'Flowise',
    description: 'Drag & drop UI to build your own LLM applications',
    url: 'https://github.com/FlowiseAI/Flowise',
    category: 'No-Code',
    capabilities: ['Visual builder', 'LLM integration', 'Chat interface']
  },
  {
    name: 'Langflow',
    description: 'Streamlined UI for LangChain with drag-and-drop interface',
    url: 'https://github.com/langflow-ai/langflow',
    category: 'No-Code',
    capabilities: ['Visual workflow', 'Component library', 'Real-time preview']
  },
  {
    name: 'OpenWebUI',
    description: 'Feature-rich chat interface for self-hosted LLMs',
    url: 'https://github.com/open-webui/open-webui',
    category: 'Chat Interface',
    capabilities: ['Chat UI', 'Model management', 'Knowledge base']
  },
  {
    name: 'OpenHands',
    description: 'Open-source software engineering agent',
    url: 'https://github.com/All-Hands-AI/OpenHands',
    category: 'Code Assistants',
    capabilities: ['Code editing', 'Terminal access', 'Browser automation']
  },
  {
    name: 'Continue',
    description: 'Open-source AI code assistant for VS Code',
    url: 'https://github.com/continuedev/continue',
    category: 'Code Assistants',
    capabilities: ['Code completion', 'Chat interface', 'Context management']
  },
  {
    name: 'Cursor',
    description: 'AI-first code editor built on VS Code',
    url: 'https://github.com/getcursor/cursor',
    category: 'Code Assistants',
    capabilities: ['AI code editing', 'Chat with codebase', 'Auto-debug']
  },
  {
    name: 'Copilot',
    description: 'AI pair programmer by GitHub',
    url: 'https://github.com/features/copilot',
    category: 'Code Assistants',
    capabilities: ['Code completion', 'Chat assistance', 'Refactoring']
  },
  {
    name: 'Replit AI',
    description: 'AI-powered IDE with code generation and deployment',
    url: 'https://replit.com/site/ai',
    category: 'Code Assistants',
    capabilities: ['Code generation', 'Deployment', 'Collaboration']
  },
  {
    name: 'Devin',
    description: 'AI software engineer that can handle complex tasks',
    url: 'https://www.cognition-labs.com/introducing-devin',
    category: 'Code Assistants',
    capabilities: ['Full-stack development', 'Task planning', 'Self-correction']
  },
  {
    name: 'Claude Code',
    description: 'AI coding assistant from Anthropic',
    url: 'https://www.anthropic.com/claude',
    category: 'Code Assistants',
    capabilities: ['Code review', 'Debugging', 'Architecture design']
  },
  {
    name: 'Phind',
    description: 'AI search engine for developers',
    url: 'https://www.phind.com',
    category: 'Search',
    capabilities: ['Code search', 'Documentation lookup', 'Stack Overflow integration']
  },
  {
    name: 'Perplexity',
    description: 'AI-powered search engine with citations',
    url: 'https://www.perplexity.ai',
    category: 'Search',
    capabilities: ['Web search', 'Citations', 'Follow-up questions']
  },
  {
    name: 'You.com',
    description: 'AI search engine with chat interface',
    url: 'https://you.com',
    category: 'Search',
    capabilities: ['Search', 'Chat', 'Code generation']
  },
  // Product Hunt AI Launches
  {
    name: 'Midjourney',
    description: 'AI image generator creating stunning artwork from text prompts',
    url: 'https://www.midjourney.com',
    category: 'Image Generation',
    capabilities: ['Text-to-image', 'Style transfer', 'Image editing']
  },
  {
    name: 'DALL-E 3',
    description: 'AI system that generates images from natural language descriptions',
    url: 'https://openai.com/dall-e-3',
    category: 'Image Generation',
    capabilities: ['Text-to-image', 'Image editing', 'High fidelity']
  },
  {
    name: 'Stable Diffusion',
    description: 'Open-source AI image generation model',
    url: 'https://stability.ai/stable-diffusion',
    category: 'Image Generation',
    capabilities: ['Text-to-image', 'Inpainting', 'ControlNet']
  },
  {
    name: 'Runway',
    description: 'AI video generation and editing platform',
    url: 'https://runwayml.com',
    category: 'Video Generation',
    capabilities: ['Text-to-video', 'Video editing', 'Motion tracking']
  },
  {
    name: 'Sora',
    description: 'AI model for generating realistic videos from text',
    url: 'https://openai.com/sora',
    category: 'Video Generation',
    capabilities: ['Text-to-video', 'Physics simulation', 'Long-form video']
  },
  {
    name: 'ElevenLabs',
    description: 'AI voice generation and cloning platform',
    url: 'https://elevenlabs.io',
    category: 'Audio Generation',
    capabilities: ['Text-to-speech', 'Voice cloning', 'Speech synthesis']
  },
  {
    name: 'Descript',
    description: 'All-in-one video and podcast editing with AI',
    url: 'https://www.descript.com',
    category: 'Video Editing',
    capabilities: ['Video editing', 'Audio editing', 'AI overdub']
  },
  {
    name: 'Jasper',
    description: 'AI content creation platform for marketing teams',
    url: 'https://www.jasper.ai',
    category: 'Content Creation',
    capabilities: ['Copywriting', 'Blog posts', 'Social media']
  },
  {
    name: 'Copy.ai',
    description: 'AI writing assistant for marketing and sales',
    url: 'https://www.copy.ai',
    category: 'Content Creation',
    capabilities: ['Copywriting', 'Email generation', 'Social posts']
  },
  {
    name: 'Writesonic',
    description: 'AI writing tool for ads, articles, and chatbots',
    url: 'https://writesonic.com',
    category: 'Content Creation',
    capabilities: ['Ad copy', 'Article writing', 'Chatbot creation']
  },
  {
    name: 'Chatbase',
    description: 'Train AI chatbot on your website data',
    url: 'https://www.chatbase.co',
    category: 'AI Chatbots',
    capabilities: ['Custom training', 'Website widget', 'Analytics']
  },
  {
    name: 'Botpress',
    description: 'Enterprise chatbot platform with visual builder',
    url: 'https://botpress.com',
    category: 'AI Chatbots',
    capabilities: ['Visual builder', 'Multi-channel', 'Analytics']
  },
  {
    name: 'Landbot',
    description: 'No-code chatbot builder for websites',
    url: 'https://landbot.io',
    category: 'AI Chatbots',
    capabilities: ['Visual builder', 'Form collection', 'Integrations']
  },
  {
    name: 'Intercom',
    description: 'AI-powered customer messaging platform',
    url: 'https://www.intercom.com',
    category: 'Customer Support',
    capabilities: ['Chatbots', 'Ticketing', 'Customer data']
  },
  {
    name: 'Drift',
    description: 'Conversational marketing and sales platform',
    url: 'https://www.drift.com',
    category: 'Customer Support',
    capabilities: ['Chatbots', 'Lead qualification', 'Meeting booking']
  },
  {
    name: 'HubSpot AI',
    description: 'AI-powered CRM and marketing automation',
    url: 'https://www.hubspot.com/products/ai',
    category: 'Marketing',
    capabilities: ['Email marketing', 'Lead scoring', 'Content optimization']
  },
  {
    name: 'MarketMuse',
    description: 'AI content planning and optimization platform',
    url: 'https://marketmuse.com',
    category: 'Marketing',
    capabilities: ['Content planning', 'SEO optimization', 'Competitor analysis']
  },
  {
    name: 'Frase',
    description: 'AI content writing and optimization tool',
    url: 'https://frase.io',
    category: 'Marketing',
    capabilities: ['Content briefs', 'SEO writing', 'Analytics']
  },
  {
    name: 'Notion AI',
    description: 'AI assistant integrated into Notion workspace',
    url: 'https://www.notion.so/product/ai',
    category: 'Productivity',
    capabilities: ['Text generation', 'Summarization', 'Task automation']
  },
  {
    name: 'Mem',
    description: 'AI-powered note-taking app that organizes itself',
    url: 'https://www.mem.ai',
    category: 'Productivity',
    capabilities: ['Auto-organization', 'Search', 'Knowledge graph']
  },
  {
    name: 'Taskade',
    description: 'AI workspace for teams with project management',
    url: 'https://www.taskade.com',
    category: 'Productivity',
    capabilities: ['Task management', 'AI generation', 'Collaboration']
  },
  {
    name: 'Gamma',
    description: 'AI-powered presentation and document creation',
    url: 'https://gamma.app',
    category: 'Content Creation',
    capabilities: ['Slide generation', 'Document creation', 'Design automation']
  },
  {
    name: 'Tome',
    description: 'AI storytelling and presentation platform',
    url: 'https://tome.app',
    category: 'Content Creation',
    capabilities: ['Storytelling', 'Presentations', 'Image generation']
  },
  {
    name: 'Murf',
    description: 'AI voice generator for videos and presentations',
    url: 'https://murf.ai',
    category: 'Audio Generation',
    capabilities: ['Text-to-speech', 'Voice customization', 'Multi-language']
  },
  {
    name: 'Synthesia',
    description: 'AI video generator with virtual avatars',
    url: 'https://www.synthesia.io',
    category: 'Video Generation',
    capabilities: ['Avatar videos', 'Multi-language', 'Custom avatars']
  },
  {
    name: 'HeyGen',
    description: 'AI video generation with avatar and voice cloning',
    url: 'https://www.heygen.com',
    category: 'Video Generation',
    capabilities: ['Avatar videos', 'Voice cloning', 'Lip sync']
  },
  {
    name: 'Pika',
    description: 'AI video generation and editing tool',
    url: 'https://pika.art',
    category: 'Video Generation',
    capabilities: ['Text-to-video', 'Video editing', 'Style transfer']
  },
  {
    name: 'Kling AI',
    description: 'Advanced AI video generation model',
    url: 'https://klingai.com',
    category: 'Video Generation',
    capabilities: ['Text-to-video', 'Image-to-video', 'Physics simulation']
  },
  {
    name: 'Suno',
    description: 'AI music generation and composition platform',
    url: 'https://suno.com',
    category: 'Audio Generation',
    capabilities: ['Music generation', 'Lyric writing', 'Style transfer']
  },
  {
    name: 'Udio',
    description: 'AI music creation platform with high-quality output',
    url: 'https://www.udio.com',
    category: 'Audio Generation',
    capabilities: ['Music generation', 'Remixing', 'Voice synthesis']
  },
  {
    name: 'Riffusion',
    description: 'AI music generation using diffusion models',
    url: 'https://www.riffusion.com',
    category: 'Audio Generation',
    capabilities: ['Music generation', 'Audio editing', 'Style transfer']
  },
  {
    name: 'Whisper',
    description: 'Open-source speech recognition model by OpenAI',
    url: 'https://github.com/openai/whisper',
    category: 'Audio Generation',
    capabilities: ['Speech-to-text', 'Transcription', 'Multi-language']
  },
  {
    name: 'AssemblyAI',
    description: 'AI speech-to-text API with advanced features',
    url: 'https://www.assemblyai.com',
    category: 'Audio Generation',
    capabilities: ['Transcription', 'Speaker diarization', 'Sentiment analysis']
  },
  {
    name: 'Replicate',
    description: 'Platform for running ML models as APIs',
    url: 'https://replicate.com',
    category: 'Development Platform',
    capabilities: ['Model hosting', 'API management', 'GPU scaling']
  },
  {
    name: 'Hugging Face',
    description: 'Platform for ML models and datasets',
    url: 'https://huggingface.co',
    category: 'Development Platform',
    capabilities: ['Model hub', 'Inference API', 'Dataset hosting']
  },
  {
    name: 'Banana',
    description: 'Serverless GPU cloud for ML inference',
    url: 'https://banan.ai',
    category: 'Development Platform',
    capabilities: ['GPU hosting', 'Auto-scaling', 'API endpoints']
  },
  {
    name: 'Modal',
    description: 'Serverless compute platform for Python',
    url: 'https://modal.com',
    category: 'Development Platform',
    capabilities: ['Serverless compute', 'GPU support', 'Python native']
  },
  {
    name: 'Baseten',
    description: 'Deploy and scale ML models with ease',
    url: 'https://baseten.co',
    category: 'Development Platform',
    capabilities: ['Model deployment', 'Auto-scaling', 'Monitoring']
  },
  {
    name: 'Anyscale',
    description: 'Platform for running AI workloads at scale',
    url: 'https://www.anyscale.com',
    category: 'Development Platform',
    capabilities: ['Distributed computing', 'Ray framework', 'Model serving']
  },
  {
    name: 'Weights & Biases',
    description: 'ML experiment tracking and model management',
    url: 'https://wandb.ai',
    category: 'Development Platform',
    capabilities: ['Experiment tracking', 'Model registry', 'Visualization']
  },
  {
    name: 'Comet',
    description: 'MLOps platform for experiment tracking',
    url: 'https://www.comet.com',
    category: 'Development Platform',
    capabilities: ['Experiment tracking', 'Model monitoring', 'Alerts']
  },
  {
    name: 'Neptune',
    description: 'Metadata store for ML experiments and models',
    url: 'https://neptune.ai',
    category: 'Development Platform',
    capabilities: ['Experiment tracking', 'Model registry', 'Collaboration']
  },
  {
    name: 'Paperspace',
    description: 'GPU cloud for ML development and training',
    url: 'https://www.paperspace.com',
    category: 'Development Platform',
    capabilities: ['GPU instances', 'Notebooks', 'Job scheduling']
  },
  {
    name: 'Lambda',
    description: 'GPU cloud platform for deep learning',
    url: 'https://lambdalabs.com',
    category: 'Development Platform',
    capabilities: ['GPU instances', 'Managed services', 'High performance']
  },
  {
    name: 'DataStax AI',
    description: 'Vector database for AI applications',
    url: 'https://www.datastax.com/products/datastax-astra',
    category: 'Data',
    capabilities: ['Vector search', 'Similarity search', 'Scalability']
  },
  {
    name: 'Pinecone',
    description: 'Managed vector database for AI applications',
    url: 'https://www.pinecone.io',
    category: 'Data',
    capabilities: ['Vector storage', 'Similarity search', 'Real-time indexing']
  },
  {
    name: 'Weaviate',
    description: 'Open-source vector database with GraphQL',
    url: 'https://weaviate.io',
    category: 'Data',
    capabilities: ['Vector search', 'Hybrid search', 'Multi-modal']
  },
  {
    name: 'Qdrant',
    description: 'Vector search engine for AI applications',
    url: 'https://qdrant.tech',
    category: 'Data',
    capabilities: ['Vector search', 'Filtering', 'Real-time indexing']
  },
  {
    name: 'Milvus',
    description: 'Open-source vector database for scale',
    url: 'https://milvus.io',
    category: 'Data',
    capabilities: ['Vector search', 'Horizontal scaling', 'Cloud-native']
  },
  {
    name: 'Chroma',
    description: 'Open-source embedding database',
    url: 'https://www.trychroma.com',
    category: 'Data',
    capabilities: ['Embedding storage', 'Similarity search', 'Simple API']
  },
  {
    name: 'LanceDB',
    description: 'Serverless vector database for AI apps',
    url: 'https://lancedb.com',
    category: 'Data',
    capabilities: ['Vector search', 'Serverless', 'ACID transactions']
  },
  {
    name: 'Vespa',
    description: 'Engine for scalable AI applications',
    url: 'https://vespa.ai',
    category: 'Data',
    capabilities: ['Vector search', 'Machine learning', 'Real-time processing']
  },
  {
    name: 'Elasticsearch',
    description: 'Search analytics engine with vector capabilities',
    url: 'https://www.elastic.co/elasticsearch',
    category: 'Data',
    capabilities: ['Full-text search', 'Vector search', 'Analytics']
  },
  {
    name: 'Postgres with pgvector',
    description: 'PostgreSQL extension for vector similarity search',
    url: 'https://github.com/pgvector/pgvector',
    category: 'Data',
    capabilities: ['Vector search', 'SQL integration', 'ACID compliance']
  }
];

// Helper to find category ID
function findCategoryId(name) {
  const result = db.prepare('SELECT id FROM categories WHERE name = ?').get(name);
  return result ? result.id : null;
}

// Insert community agents
let inserted = 0;
let skipped = 0;

console.log('🌐 Seeding community agent listings...\n');

communityAgents.forEach(agent => {
  // Check if agent already exists by URL
  const existing = db.prepare('SELECT id FROM agents WHERE endpoint_url = ?').get(agent.url);
  
  if (existing) {
    skipped++;
    console.log(`⏭️  Skipped (exists): ${agent.name}`);
    return;
  }
  
  // Insert agent
  const agentId = db.prepare(`
    INSERT INTO agents (operator_id, name, description, endpoint_url, status, created_at, updated_at, community_listing)
    VALUES (?, ?, ?, ?, 'pending', ?, ?, 1)
  `).run('community', agent.name, agent.description, agent.url, Date.now(), Date.now());
  
  // Insert capabilities as JSON
  const capabilities = agent.capabilities || ['AI Agent'];
  const capStmt = db.prepare('UPDATE agents SET capabilities = ? WHERE id = ?');
  capStmt.run(JSON.stringify(capabilities), agentId);
  
  // Set claim URL for community listings
  const claimStmt = db.prepare('UPDATE agents SET claim_url = ? WHERE id = ?');
  claimStmt.run(`/agents/${agentId}/claim`, agentId);
  
  // Link to category
  const categoryId = findCategoryId(agent.category);
  if (categoryId) {
    db.prepare(`
      INSERT OR IGNORE INTO agent_categories (agent_id, category_id)
      VALUES (?, ?)
    `).run(agentId, categoryId);
  }
  
  inserted++;
  console.log(`✅ Added: ${agent.name} (${agent.category})`);
});

console.log(`\n📊 Results: ${inserted} inserted, ${skipped} skipped`);
console.log(`💡 These are community listings - operators can claim them via "Claim this listing" button`);