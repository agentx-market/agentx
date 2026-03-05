#!/usr/bin/env node
/**
 * Seed community agent listings from public directories
 * Feature #71: Create skeleton listings for 50+ agents
 * Sources: GitHub trending AI repos, Product Hunt AI launches, public directories
 */

const db = require('./db');

// Community listings data curated from public sources
const communityListings = [
  // GitHub Trending AI Repos
  {
    name: 'LangChain',
    description: 'Framework for developing applications powered by LLMs. Build contextual AI apps with chains, agents, and memory.',
    categories: ['AI Chatbots', 'Code Assistants'],
    externalUrl: 'https://github.com/langchain-ai/langchain',
    community_listing: true
  },
  {
    name: 'LlamaIndex',
    description: 'Data framework for LLM applications. Ingest, structure, and access your data for RAG and agent workflows.',
    categories: ['Data Analysis', 'Code Assistants'],
    externalUrl: 'https://github.com/run-llama/llama_index',
    community_listing: true
  },
  {
    name: 'AutoGen',
    description: 'Multi-agent conversation framework for building AI agents. Enable collaborative problem-solving with multiple agents.',
    categories: ['AI Chatbots', 'Code Assistants'],
    externalUrl: 'https://github.com/microsoft/autogen',
    community_listing: true
  },
  {
    name: 'Haystack',
    description: 'End-to-end LLM toolkit for building production-ready search and QA systems. Modular and extensible.',
    categories: ['AI Chatbots', 'Data Analysis'],
    externalUrl: 'https://github.com/deepset-ai/haystack',
    community_listing: true
  },
  {
    name: 'Dify',
    description: 'LLM app development platform. Build, deploy, and manage AI applications with a visual workflow builder.',
    categories: ['AI Chatbots', 'Code Assistants'],
    externalUrl: 'https://github.com/langgenius/dify',
    community_listing: true
  },
  {
    name: 'Flowise',
    description: 'Drag & drop UI to build your customized LLM flow. Visual workflow builder for AI agents.',
    categories: ['AI Chatbots', 'Code Assistants'],
    externalUrl: 'https://github.com/FlowiseAI/Flowise',
    community_listing: true
  },
  {
    name: 'OpenWebUI',
    description: 'Feature-rich LLM UI. Self-hosted chat interface with support for multiple models and RAG.',
    categories: ['AI Chatbots', 'Code Assistants'],
    externalUrl: 'https://github.com/open-webui/open-webui',
    community_listing: true
  },
  {
    name: 'Ollama',
    description: 'Run LLMs locally on your machine. Easy setup for running Llama, Mistral, and other models.',
    categories: ['AI Chatbots', 'Code Assistants'],
    externalUrl: 'https://github.com/ollama/ollama',
    community_listing: true
  },
  {
    name: 'ComfyUI',
    description: 'The most powerful and modular GUI for Stable Diffusion. Node-based interface for image generation.',
    categories: ['Design Tools', 'Video Tools'],
    externalUrl: 'https://github.com/comfyanonymous/ComfyUI',
    community_listing: true
  },
  {
    name: 'AnythingLLM',
    description: 'All-in-one AI workspace. RAG, chat, and document management in a single desktop app.',
    categories: ['AI Chatbots', 'Data Analysis'],
    externalUrl: 'https://github.com/Mintplex-Labs/anything-llm',
    community_listing: true
  },
  
  // Product Hunt AI Launches
  {
    name: 'Cursor',
    description: 'AI-first code editor. Build software faster with AI-powered code completion and refactoring.',
    categories: ['Code Assistants', 'Productivity'],
    externalUrl: 'https://cursor.com',
    community_listing: true
  },
  {
    name: 'Replit AI',
    description: 'Cloud-based IDE with AI coding assistant. Build, deploy, and collaborate in the browser.',
    categories: ['Code Assistants', 'Productivity'],
    externalUrl: 'https://replit.com',
    community_listing: true
  },
  {
    name: 'Gamma',
    description: 'AI-powered presentation and document creation. Create beautiful decks in seconds.',
    categories: ['Content Creation', 'Productivity'],
    externalUrl: 'https://gamma.app',
    community_listing: true
  },
  {
    name: 'Notion AI',
    description: 'AI workspace assistant. Write, summarize, and organize content with AI help.',
    categories: ['Productivity', 'Content Creation'],
    externalUrl: 'https://notion.so',
    community_listing: true
  },
  {
    name: 'Jasper',
    description: 'AI content platform for marketing teams. Create blogs, ads, and social posts at scale.',
    categories: ['Content Creation', 'Marketing'],
    externalUrl: 'https://jasper.ai',
    community_listing: true
  },
  {
    name: 'Descript',
    description: 'All-in-one audio and video editing with AI. Edit video by editing text transcripts.',
    categories: ['Video Tools', 'Content Creation'],
    externalUrl: 'https://descript.com',
    community_listing: true
  },
  {
    name: 'Runway ML',
    description: 'AI creative suite for video generation and editing. Text-to-video, image generation, and more.',
    categories: ['Video Tools', 'Design Tools'],
    externalUrl: 'https://runwayml.com',
    community_listing: true
  },
  {
    name: 'Midjourney',
    description: 'AI art generator. Create stunning images from text prompts. Leading generative AI art tool.',
    categories: ['Design Tools', 'Content Creation'],
    externalUrl: 'https://midjourney.com',
    community_listing: true
  },
  {
    name: 'ElevenLabs',
    description: 'AI voice generation and cloning. Create realistic speech from text with multiple voices.',
    categories: ['Voice Assistants', 'Content Creation'],
    externalUrl: 'https://elevenlabs.io',
    community_listing: true
  },
  {
    name: 'Synthesia',
    description: 'AI video generation with avatars. Create professional videos with AI presenters in 120+ languages.',
    categories: ['Video Tools', 'Content Creation'],
    externalUrl: 'https://synthesia.io',
    community_listing: true
  },
  
  // More GitHub & Public Directory Agents
  {
    name: 'Hugging Face Transformers',
    description: 'State-of-the-art ML models for NLP, CV, and more. 500k+ models for every use case.',
    categories: ['AI Chatbots', 'Data Analysis'],
    externalUrl: 'https://huggingface.co',
    community_listing: true
  },
  {
    name: 'Stability AI',
    description: 'Open-source AI for image generation. Stable Diffusion models and tools for creators.',
    categories: ['Design Tools', 'Video Tools'],
    externalUrl: 'https://stability.ai',
    community_listing: true
  },
  {
    name: 'Perplexity AI',
    description: 'AI search engine with citations. Get answers with sources from the web.',
    categories: ['AI Chatbots', 'Research'],
    externalUrl: 'https://perplexity.ai',
    community_listing: true
  },
  {
    name: 'Anthropic Claude',
    description: 'Safe, helpful AI assistant. Large context window for complex tasks and document analysis.',
    categories: ['AI Chatbots', 'Data Analysis'],
    externalUrl: 'https://anthropic.com',
    community_listing: true
  },
  {
    name: 'OpenAI GPT',
    description: 'Advanced language models for text, code, and vision. GPT-4o for multimodal tasks.',
    categories: ['AI Chatbots', 'Code Assistants'],
    externalUrl: 'https://openai.com',
    community_listing: true
  },
  {
    name: 'Mistral AI',
    description: 'Efficient open-weight models. Mixtral and Mistral models for production use.',
    categories: ['AI Chatbots', 'Code Assistants'],
    externalUrl: 'https://mistral.ai',
    community_listing: true
  },
  {
    name: 'Cohere',
    description: 'Enterprise AI platform. RAG, search, and classification APIs for businesses.',
    categories: ['AI Chatbots', 'Data Analysis'],
    externalUrl: 'https://cohere.com',
    community_listing: true
  },
  {
    name: 'Replicate',
    description: 'Run ML models in the cloud. Deploy and scale AI models with simple API.',
    categories: ['AI Chatbots', 'Code Assistants'],
    externalUrl: 'https://replicate.com',
    community_listing: true
  },
  {
    name: 'Vercel AI SDK',
    description: 'Build AI-powered chatbots and assistants. Stream tokens, handle errors, and more.',
    categories: ['Code Assistants', 'AI Chatbots'],
    externalUrl: 'https://sdk.vercel.ai',
    community_listing: true
  },
  {
    name: 'Langfuse',
    description: 'LLM observability platform. Track, evaluate, and debug AI applications.',
    categories: ['Monitoring', 'Data Analysis'],
    externalUrl: 'https://langfuse.com',
    community_listing: true
  },
  {
    name: 'Weights & Biases',
    description: 'MLOps platform for ML experiments. Track, visualize, and reproduce ML workflows.',
    categories: ['Monitoring', 'Data Analysis'],
    externalUrl: 'https://wandb.ai',
    community_listing: true
  },
  {
    name: 'Pinecone',
    description: 'Vector database for AI applications. Fast, scalable similarity search for RAG.',
    categories: ['Data', 'Code Assistants'],
    externalUrl: 'https://pinecone.io',
    community_listing: true
  },
  {
    name: 'Weaviate',
    description: 'Open-source vector database. Hybrid search with GraphQL and machine learning.',
    categories: ['Data', 'Code Assistants'],
    externalUrl: 'https://weaviate.io',
    community_listing: true
  },
  {
    name: 'Qdrant',
    description: 'Vector search engine. High-performance similarity search with filtering.',
    categories: ['Data', 'Code Assistants'],
    externalUrl: 'https://qdrant.tech',
    community_listing: true
  },
  {
    name: 'Chroma',
    description: 'AI-native vector database. Simple, developer-friendly embeddings storage.',
    categories: ['Data', 'Code Assistants'],
    externalUrl: 'https://trychroma.com',
    community_listing: true
  },
  {
    name: 'LanceDB',
    description: 'Serverless vector database for AI apps. Built-in hybrid search and embeddings.',
    categories: ['Data', 'Code Assistants'],
    externalUrl: 'https://lancedb.com',
    community_listing: true
  },
  {
    name: 'Supabase',
    description: 'Open-source Firebase alternative. PostgreSQL with real-time subscriptions and auth.',
    categories: ['Data', 'Code Assistants'],
    externalUrl: 'https://supabase.com',
    community_listing: true
  },
  {
    name: 'Vercel',
    description: 'Deploy frontend and edge functions. Git-based deployment for modern web apps.',
    categories: ['Code Assistants', 'Productivity'],
    externalUrl: 'https://vercel.com',
    community_listing: true
  },
  {
    name: 'Railway',
    description: 'Cloud platform for developers. Deploy apps with one click. Full-stack hosting.',
    categories: ['Code Assistants', 'Productivity'],
    externalUrl: 'https://railway.app',
    community_listing: true
  },
  {
    name: 'Render',
    description: 'Cloud hosting for apps, services, and websites. Automated deploys from Git.',
    categories: ['Code Assistants', 'Productivity'],
    externalUrl: 'https://render.com',
    community_listing: true
  },
  {
    name: 'Docker',
    description: 'Container platform for building and shipping apps. Standardize development environments.',
    categories: ['Code Assistants', 'Productivity'],
    externalUrl: 'https://docker.com',
    community_listing: true
  },
  {
    name: 'Kubernetes',
    description: 'Container orchestration platform. Automate deployment, scaling, and management.',
    categories: ['Monitoring', 'Code Assistants'],
    externalUrl: 'https://kubernetes.io',
    community_listing: true
  },
  {
    name: 'Prometheus',
    description: 'Systems monitoring and alerting toolkit. Time-series database for metrics.',
    categories: ['Monitoring', 'Data Analysis'],
    externalUrl: 'https://prometheus.io',
    community_listing: true
  },
  {
    name: 'Grafana',
    description: 'Analytics and monitoring platform. Visualize metrics, logs, and traces.',
    categories: ['Monitoring', 'Data Analysis'],
    externalUrl: 'https://grafana.com',
    community_listing: true
  },
  {
    name: 'Datadog',
    description: 'Cloud monitoring service. Monitor infrastructure, applications, and logs.',
    categories: ['Monitoring', 'Security'],
    externalUrl: 'https://datadog.com',
    community_listing: true
  },
  {
    name: 'Sentry',
    description: 'Application monitoring and error tracking. Real-time error detection and debugging.',
    categories: ['Monitoring', 'Security'],
    externalUrl: 'https://sentry.io',
    community_listing: true
  },
  {
    name: 'PostHog',
    description: 'Product analytics platform. Track user behavior, feature flags, and A/B tests.',
    categories: ['Data Analysis', 'Monitoring'],
    externalUrl: 'https://posthog.com',
    community_listing: true
  },
  {
    name: 'Mixpanel',
    description: 'Product analytics for user behavior. Track events and analyze user journeys.',
    categories: ['Data Analysis', 'Marketing'],
    externalUrl: 'https://mixpanel.com',
    community_listing: true
  },
  {
    name: 'Amplitude',
    description: 'Digital analytics platform. Understand user behavior and optimize products.',
    categories: ['Data Analysis', 'Marketing'],
    externalUrl: 'https://amplitude.com',
    community_listing: true
  },
  {
    name: 'Stripe',
    description: 'Online payment processing. Accept payments, manage subscriptions, and payouts.',
    categories: ['Payments', 'E-commerce'],
    externalUrl: 'https://stripe.com',
    community_listing: true
  },
  {
    name: 'PayPal',
    description: 'Digital payments platform. Send, receive, and store payments online.',
    categories: ['Payments', 'E-commerce'],
    externalUrl: 'https://paypal.com',
    community_listing: true
  },
  {
    name: 'Square',
    description: 'Payment and point-of-sale solutions. Accept card payments and manage business.',
    categories: ['Payments', 'E-commerce'],
    externalUrl: 'https://squareup.com',
    community_listing: true
  },
  {
    name: 'Shopify',
    description: 'E-commerce platform for online stores. Build and manage your online business.',
    categories: ['E-commerce', 'Marketing'],
    externalUrl: 'https://shopify.com',
    community_listing: true
  },
  {
    name: 'WooCommerce',
    description: 'WordPress e-commerce plugin. Turn your WordPress site into an online store.',
    categories: ['E-commerce', 'Web Development'],
    externalUrl: 'https://woocommerce.com',
    community_listing: true
  },
  {
    name: 'Mailchimp',
    description: 'Email marketing and automation platform. Build audiences and grow revenue.',
    categories: ['Email Assistants', 'Marketing'],
    externalUrl: 'https://mailchimp.com',
    community_listing: true
  },
  {
    name: 'SendGrid',
    description: 'Cloud-based email delivery service. Send transactional and marketing emails.',
    categories: ['Email Assistants', 'Marketing'],
    externalUrl: 'https://sendgrid.com',
    community_listing: true
  },
  {
    name: 'Twilio',
    description: 'Cloud communications platform. SMS, voice, and video APIs for developers.',
    categories: ['AI Chatbots', 'Code Assistants'],
    externalUrl: 'https://twilio.com',
    community_listing: true
  },
  {
    name: 'Zapier',
    description: 'Automation platform for apps. Connect 5000+ apps and automate workflows.',
    categories: ['Productivity', 'Data'],
    externalUrl: 'https://zapier.com',
    community_listing: true
  },
  {
    name: 'Make (Integromat)',
    description: 'Visual automation platform. Build complex workflows with drag-and-drop.',
    categories: ['Productivity', 'Data'],
    externalUrl: 'https://make.com',
    community_listing: true
  },
  {
    name: 'n8n',
    description: 'Workflow automation tool. Node-based automation with self-host option.',
    categories: ['Productivity', 'Data'],
    externalUrl: 'https://n8n.io',
    community_listing: true
  },
  {
    name: 'Airtable',
    description: 'Database-spreadsheet hybrid. Flexible data management with powerful views.',
    categories: ['Data', 'Productivity'],
    externalUrl: 'https://airtable.com',
    community_listing: true
  },
  {
    name: 'Notion',
    description: 'All-in-one workspace. Notes, docs, tasks, and databases in one place.',
    categories: ['Productivity', 'Content Creation'],
    externalUrl: 'https://notion.so',
    community_listing: true
  },
  {
    name: 'Slack',
    description: 'Team communication platform. Channels, messages, and integrations for teams.',
    categories: ['Productivity', 'AI Chatbots'],
    externalUrl: 'https://slack.com',
    community_listing: true
  },
  {
    name: 'Discord',
    description: 'Community communication platform. Voice, video, and text for communities.',
    categories: ['AI Chatbots', 'Productivity'],
    externalUrl: 'https://discord.com',
    community_listing: true
  },
  {
    name: 'GitHub Copilot',
    description: 'AI pair programmer. Code completion and suggestions in your editor.',
    categories: ['Code Assistants', 'Productivity'],
    externalUrl: 'https://github.com/features/copilot',
    community_listing: true
  },
  {
    name: 'Tabnine',
    description: 'AI code completion tool. Support for all major IDEs and languages.',
    categories: ['Code Assistants', 'Productivity'],
    externalUrl: 'https://tabnine.com',
    community_listing: true
  },
  {
    name: 'Codeium',
    description: 'Free AI code completion and chat. Alternative to GitHub Copilot.',
    categories: ['Code Assistants', 'Productivity'],
    externalUrl: 'https://codeium.com',
    community_listing: true
  }
];

// Get category IDs
function getCategoryIds(categoryNames) {
  const categoryIds = [];
  categoryNames.forEach(name => {
    const cat = db.prepare('SELECT id FROM categories WHERE slug = ? OR name = ?').get(name.toLowerCase().replace(/ /g, '-'), name);
    if (cat) {
      categoryIds.push(cat.id);
    }
  });
  return categoryIds;
}

// Insert community listings
function seedCommunityListings() {
  const now = Date.now();
  let inserted = 0;
  let skipped = 0;
  
  const insertAgent = db.prepare(`
    INSERT OR IGNORE INTO agents (
      operator_id, name, description, capabilities, endpoint_url, 
      pricing, status, created_at, updated_at, community_listing
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
  `);
  
  const insertAgentCategory = db.prepare(`
    INSERT OR IGNORE INTO agent_categories (agent_id, category_id) VALUES (?, ?)
  `);
  
  const checkAgent = db.prepare('SELECT id FROM agents WHERE name = ?');
  
  communityListings.forEach(listing => {
    const existing = checkAgent.get(listing.name);
    
    if (existing) {
      skipped++;
      console.log(`⏭️  Skipped (exists): ${listing.name}`);
      return;
    }
    
    const capabilities = JSON.stringify(['community_listing']);
    const categoryIds = getCategoryIds(listing.categories);
    
    try {
      const result = insertAgent.run(
        null, // operator_id (null for community listing)
        listing.name,
        listing.description,
        capabilities,
        listing.externalUrl, // endpoint_url (external URL)
        'Free', // pricing
        now,
        now,
        true // community_listing
      );
      
      inserted++;
      console.log(`✅ Inserted: ${listing.name}`);
      
      // Insert categories
      categoryIds.forEach(catId => {
        insertAgentCategory.run(result.lastInsertRowid, catId);
      });
    } catch (err) {
      console.error(`❌ Error inserting ${listing.name}:`, err.message);
    }
  });
  
  console.log(`\n📊 Summary:`);
  console.log(`   Inserted: ${inserted}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Total: ${communityListings.length}`);
  
  // Verify
  const communityCount = db.prepare('SELECT COUNT(*) as c FROM agents WHERE community_listing = 1').get();
  console.log(`\n🎯 Community listings in DB: ${communityCount.c}`);
}

// Run seeding
seedCommunityListings();