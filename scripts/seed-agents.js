#!/usr/bin/env node
/**
 * Seed 50+ agent listings from public directories
 * Creates 'community listings' with Claim this listing button
 */

const fs = require('fs');
const path = require('path');
const db = require('../db');

// Agent data from public sources
const agents = [
  // GitHub Trending AI Repos
  {
    name: 'LangChain',
    description: 'Build contextual AI applications with chains, agents, and memory.',
    category: 'Development Framework',
    external_url: 'https://github.com/langchain-ai/langchain',
    capabilities: ['Chain of thought', 'Memory', 'Tool use', 'RAG'],
    source: 'GitHub'
  },
  {
    name: 'LlamaIndex',
    description: 'Data framework for LLM applications to ingest, structure, and access private or domain-specific data.',
    category: 'Development Framework',
    external_url: 'https://github.com/run-llama/llama_index',
    capabilities: ['RAG', 'Data indexing', 'Query engine', 'Data connectors'],
    source: 'GitHub'
  },
  {
    name: 'AutoGen',
    description: 'A programming framework for building AI agents and multi-agent conversations.',
    category: 'Multi-Agent',
    external_url: 'https://github.com/microsoft/autogen',
    capabilities: ['Multi-agent', 'Code generation', 'Task automation', 'Conversation'],
    source: 'GitHub'
  },
  {
    name: 'CrewAI',
    description: 'Framework for orchestrating role-playing AI agents.',
    category: 'Multi-Agent',
    external_url: 'https://github.com/joaomdmoura/crewai',
    capabilities: ['Role-playing', 'Task delegation', 'Multi-agent', 'Workflow'],
    source: 'GitHub'
  },
  {
    name: 'Flowise',
    description: 'Build LLM apps visually with drag-and-drop.',
    category: 'No-Code',
    external_url: 'https://github.com/FlowiseAI/Flowise',
    capabilities: ['Visual builder', 'LLM apps', 'Workflow', 'No-code'],
    source: 'GitHub'
  },
  {
    name: 'Dify',
    description: 'LLM app development platform. All-in-one platform for AI native app development.',
    category: 'Development Platform',
    external_url: 'https://github.com/langgenius/dify',
    capabilities: ['App builder', 'Workflow', 'RAG', 'Agent orchestration'],
    source: 'GitHub'
  },
  {
    name: 'OpenWebUI',
    description: 'Feature-rich AI chat interface with local LLM support.',
    category: 'Chat Interface',
    external_url: 'https://github.com/open-webui/open-webui',
    capabilities: ['Chat UI', 'Local LLM', 'RAG', 'Multi-user'],
    source: 'GitHub'
  },
  {
    name: 'AnythingLLM',
    description: 'All-in-one AI workspace for documents, apps, and teams.',
    category: 'Chat Interface',
    external_url: 'https://github.com/Mintplex-Labs/anything-llm',
    capabilities: ['Document AI', 'RAG', 'Workspace', 'Team collaboration'],
    source: 'GitHub'
  },
  {
    name: 'n8n',
    description: 'Workflow automation tool with AI agent capabilities.',
    category: 'Automation',
    external_url: 'https://github.com/n8n-io/n8n',
    capabilities: ['Workflow automation', 'AI agents', 'Integrations', 'Visual builder'],
    source: 'GitHub'
  },
  {
    name: 'HuggingFace Transformers',
    description: 'State-of-the-art machine learning for PyTorch, TensorFlow, and JAX.',
    category: 'Development Framework',
    external_url: 'https://github.com/huggingface/transformers',
    capabilities: ['NLP', 'Computer vision', 'Audio', 'Pre-trained models'],
    source: 'GitHub'
  },
  {
    name: 'LangGraph',
    description: 'Building stateful, multi-actor applications with LLMs.',
    category: 'Development Framework',
    external_url: 'https://github.com/langchain-ai/langgraph',
    capabilities: ['Stateful agents', 'Graph-based workflows', 'Multi-actor', 'Cycle handling'],
    source: 'GitHub'
  },
  {
    name: 'Semantic Kernel',
    description: 'SDK for integrating LLMs into traditional codebases.',
    category: 'Development Framework',
    external_url: 'https://github.com/microsoft/semantic-kernel',
    capabilities: ['Plugin system', 'Orchestration', 'Memory', 'Function calling'],
    source: 'GitHub'
  },
  {
    name: 'Haystack',
    description: 'End-to-end LLM toolkits for building search and QA systems.',
    category: 'Development Framework',
    external_url: 'https://github.com/deepset-ai/haystack',
    capabilities: ['Search', 'QA systems', 'RAG', 'Document indexing'],
    source: 'GitHub'
  },
  {
    name: 'LlamaCraft',
    description: 'Build production-ready LLM applications with LlamaStack.',
    category: 'Development Platform',
    external_url: 'https://github.com/meta-llama/llama-craft',
    capabilities: ['Production deployment', 'LLM integration', 'API management'],
    source: 'GitHub'
  },
  {
    name: 'Vercel AI SDK',
    description: 'Comprehensive toolkit for building AI-powered applications.',
    category: 'Development Framework',
    external_url: 'https://github.com/vercel/ai',
    capabilities: ['Stream responses', 'Tool calling', 'UI components', 'Streaming'],
    source: 'GitHub'
  },
  
  // Product Hunt AI Launches
  {
    name: 'Perplexity AI',
    description: 'AI-powered search engine with conversational interface.',
    category: 'Search',
    external_url: 'https://www.perplexity.ai',
    capabilities: ['Conversational search', 'Citations', 'File upload', 'Web search'],
    source: 'Product Hunt'
  },
  {
    name: 'Claude',
    description: 'Advanced AI assistant by Anthropic for complex tasks.',
    category: 'AI Assistant',
    external_url: 'https://claude.ai',
    capabilities: ['Long context', 'Code generation', 'Analysis', 'Creative writing'],
    source: 'Product Hunt'
  },
  {
    name: 'Midjourney',
    description: 'AI image generation from text prompts.',
    category: 'Image Generation',
    external_url: 'https://www.midjourney.com',
    capabilities: ['Image generation', 'Style transfer', 'Upscaling', 'Variations'],
    source: 'Product Hunt'
  },
  {
    name: 'Runway ML',
    description: 'AI-powered creative tools for video and image editing.',
    category: 'Video Editing',
    external_url: 'https://runwayml.com',
    capabilities: ['Video generation', 'Image editing', 'Motion tracking', 'Green screen'],
    source: 'Product Hunt'
  },
  {
    name: 'Descript',
    description: 'All-in-one audio and video editing with AI transcription.',
    category: 'Video Editing',
    external_url: 'https://www.descript.com',
    capabilities: ['Transcription', 'Video editing', 'Overdub', 'Screen recording'],
    source: 'Product Hunt'
  },
  {
    name: 'Jasper',
    description: 'AI content creation platform for marketing teams.',
    category: 'Content Creation',
    external_url: 'https://www.jasper.ai',
    capabilities: ['Copywriting', 'Blog posts', 'Social media', 'Brand voice'],
    source: 'Product Hunt'
  },
  {
    name: 'Notion AI',
    description: 'AI-powered productivity and note-taking platform.',
    category: 'Productivity',
    external_url: 'https://www.notion.so',
    capabilities: ['Writing assistant', 'Summarization', 'Task management', 'Knowledge base'],
    source: 'Product Hunt'
  },
  {
    name: 'Gamma',
    description: 'AI-powered presentation and document creation.',
    category: 'Content Creation',
    external_url: 'https://gamma.app',
    capabilities: ['Presentation builder', 'Document creation', 'Design automation', 'Templates'],
    source: 'Product Hunt'
  },
  {
    name: 'Copy.ai',
    description: 'AI copywriting tool for marketing and sales.',
    category: 'Content Creation',
    external_url: 'https://www.copy.ai',
    capabilities: ['Copywriting', 'Social media', 'Email campaigns', 'Landing pages'],
    source: 'Product Hunt'
  },
  {
    name: 'Synthesia',
    description: 'AI video generation with digital avatars.',
    category: 'Video Generation',
    external_url: 'https://www.synthesia.io',
    capabilities: ['Avatar video', 'Text-to-speech', 'Multi-language', 'Custom avatars'],
    source: 'Product Hunt'
  },
  {
    name: 'Murf AI',
    description: 'AI voice generator for videos and presentations.',
    category: 'Audio Generation',
    external_url: 'https://murf.ai',
    capabilities: ['Text-to-speech', 'Voice cloning', 'Multi-language', 'Voice effects'],
    source: 'Product Hunt'
  },
  {
    name: 'ElevenLabs',
    description: 'Advanced AI speech synthesis and voice cloning.',
    category: 'Audio Generation',
    external_url: 'https://elevenlabs.io',
    capabilities: ['Voice cloning', 'Text-to-speech', 'Speech synthesis', 'Dubbing'],
    source: 'Product Hunt'
  },
  {
    name: 'Chatbase',
    description: 'Train AI chatbots on your documents in minutes.',
    category: 'Chatbot',
    external_url: 'https://www.chatbase.co',
    capabilities: ['Document upload', 'Chatbot builder', 'Analytics', 'Custom training'],
    source: 'Product Hunt'
  },
  {
    name: 'Tome',
    description: 'AI-powered storytelling and presentation platform.',
    category: 'Content Creation',
    external_url: 'https://tome.app',
    capabilities: ['Storytelling', 'Presentations', 'Image generation', 'Narrative flow'],
    source: 'Product Hunt'
  },
  {
    name: 'Framer AI',
    description: 'AI website builder with design automation.',
    category: 'Web Development',
    external_url: 'https://www.framer.com',
    capabilities: ['Website builder', 'Design automation', 'CMS', 'Hosting'],
    source: 'Product Hunt'
  },
  
  // AI Agents Directory
  {
    name: 'Character.AI',
    description: 'Create and chat with AI characters of any persona.',
    category: 'Chatbot',
    external_url: 'https://character.ai',
    capabilities: ['Character creation', 'Roleplay', 'Conversation', 'Community'],
    source: 'AI Agents Directory'
  },
  {
    name: 'Replika',
    description: 'AI companion for conversation and emotional support.',
    category: 'AI Assistant',
    external_url: 'https://replika.ai',
    capabilities: ['Companion', 'Emotional support', 'Memory', 'Voice calls'],
    source: 'AI Agents Directory'
  },
  {
    name: 'Pi',
    description: 'Empathetic AI designed for meaningful conversations.',
    category: 'AI Assistant',
    external_url: 'https://inflection.ai',
    capabilities: ['Conversational AI', 'Empathy', 'Personal assistant', 'Voice'],
    source: 'AI Agents Directory'
  },
  {
    name: 'Cognitive Cloud',
    description: 'Enterprise AI platform for custom models and workflows.',
    category: 'Enterprise',
    external_url: 'https://cognitivecloud.io',
    capabilities: ['Custom models', 'Enterprise AI', 'Workflow automation', 'Analytics'],
    source: 'AI Agents Directory'
  },
  {
    name: 'Botpress',
    description: 'Open-source conversational AI platform.',
    category: 'Chatbot',
    external_url: 'https://botpress.com',
    capabilities: ['Chatbot builder', 'Visual editor', 'NLU', 'Multi-channel'],
    source: 'AI Agents Directory'
  },
  {
    name: 'Landbot',
    description: 'No-code chatbot builder for websites.',
    category: 'Chatbot',
    external_url: 'https://landbot.io',
    capabilities: ['No-code builder', 'Visual flow', 'Website integration', 'Forms'],
    source: 'AI Agents Directory'
  },
  {
    name: 'Voiceflow',
    description: 'Visual platform for building voice and chat assistants.',
    category: 'Chatbot',
    external_url: 'https://www.voiceflow.com',
    capabilities: ['Voice assistants', 'Visual builder', 'Prototyping', 'Deployment'],
    source: 'AI Agents Directory'
  },
  {
    name: 'Dialogflow',
    description: 'Google conversational AI platform.',
    category: 'Chatbot',
    external_url: 'https://dialogflow.google.com',
    capabilities: ['NLU', 'Multi-platform', 'Google integration', 'Analytics'],
    source: 'AI Agents Directory'
  },
  {
    name: 'IBM Watson Assistant',
    description: 'Enterprise-grade conversational AI with advanced analytics.',
    category: 'Enterprise',
    external_url: 'https://www.ibm.com/watson/watson-assistant',
    capabilities: ['Enterprise AI', 'Analytics', 'Multi-channel', 'Integration'],
    source: 'AI Agents Directory'
  },
  {
    name: 'Drift',
    description: 'Conversational marketing and sales platform.',
    category: 'Sales',
    external_url: 'https://www.drift.com',
    capabilities: ['Sales chatbots', 'Lead qualification', 'Meeting booking', 'CRM integration'],
    source: 'AI Agents Directory'
  },
  {
    name: 'Intercom',
    description: 'AI-powered customer messaging platform.',
    category: 'Customer Support',
    external_url: 'https://www.intercom.com',
    capabilities: ['Customer support', 'Chatbots', 'Help desk', 'Automation'],
    source: 'AI Agents Directory'
  },
  {
    name: 'Zendesk AI',
    description: 'AI customer service automation and insights.',
    category: 'Customer Support',
    external_url: 'https://www.zendesk.com',
    capabilities: ['Ticket automation', 'Response suggestions', 'Analytics', 'Multi-channel'],
    source: 'AI Agents Directory'
  },
  {
    name: 'Freshdesk AI',
    description: 'AI-powered customer support automation.',
    category: 'Customer Support',
    external_url: 'https://www.freshdesk.com',
    capabilities: ['Ticket routing', 'Auto-responses', 'Sentiment analysis', 'Knowledge base'],
    source: 'AI Agents Directory'
  },
  {
    name: 'Adaptive AI',
    description: 'Machine learning platform for predictive analytics.',
    category: 'Analytics',
    external_url: 'https://adaptive.ai',
    capabilities: ['Predictive analytics', 'ML models', 'Data insights', 'Automation'],
    source: 'AI Agents Directory'
  },
  {
    name: 'DataRobot',
    description: 'Automated machine learning platform for enterprises.',
    category: 'Analytics',
    external_url: 'https://www.datarobot.com',
    capabilities: ['AutoML', 'Model deployment', 'MLOps', 'Enterprise AI'],
    source: 'AI Agents Directory'
  },
  {
    name: 'H2O.ai',
    description: 'Open-source AI and machine learning platform.',
    category: 'Development Framework',
    external_url: 'https://www.h2o.ai',
    capabilities: ['AutoML', 'Deep learning', 'Predictive analytics', 'Open source'],
    source: 'AI Agents Directory'
  },
  {
    name: 'Domino Data Lab',
    description: 'Data science platform for collaborative AI development.',
    category: 'Enterprise',
    external_url: 'https://www.dominodatalab.com',
    capabilities: ['Collaboration', 'Model management', 'Deployment', 'Governance'],
    source: 'AI Agents Directory'
  },
  {
    name: 'Weights & Biases',
    description: 'ML development platform for experiment tracking and model management.',
    category: 'Development Platform',
    external_url: 'https://wandb.ai',
    capabilities: ['Experiment tracking', 'Model registry', 'Visualization', 'Collaboration'],
    source: 'AI Agents Directory'
  },
  {
    name: 'Comet ML',
    description: 'MLOps platform for experiment tracking and model deployment.',
    category: 'Development Platform',
    external_url: 'https://www.comet.com',
    capabilities: ['Experiment tracking', 'Model deployment', 'Monitoring', 'A/B testing'],
    source: 'AI Agents Directory'
  },
  {
    name: 'Paperspace Gradient',
    description: 'AI development platform with GPU cloud infrastructure.',
    category: 'Development Platform',
    external_url: 'https://www.paperspace.com',
    capabilities: ['GPU cloud', 'Notebooks', 'Model training', 'Deployment'],
    source: 'AI Agents Directory'
  },
  {
    name: 'Lambda Labs',
    description: 'AI cloud infrastructure for deep learning.',
    category: 'Infrastructure',
    external_url: 'https://lambdalabs.com',
    capabilities: ['GPU instances', 'Deep learning', 'Cloud infrastructure', 'Training'],
    source: 'AI Agents Directory'
  },
  {
    name: 'RunPod',
    description: 'Cloud GPU rental for AI workloads and inference.',
    category: 'Infrastructure',
    external_url: 'https://www.runpod.io',
    capabilities: ['GPU rental', 'Serverless', 'Container deployment', 'AI inference'],
    source: 'AI Agents Directory'
  },
  {
    name: 'Vast.ai',
    description: 'Decentralized GPU marketplace for AI computing.',
    category: 'Infrastructure',
    external_url: 'https://vast.ai',
    capabilities: ['GPU marketplace', 'Decentralized', 'Cost-effective', 'Flexible'],
    source: 'AI Agents Directory'
  },
  {
    name: 'Replicate',
    description: 'Deploy and scale AI models with simple API.',
    category: 'Infrastructure',
    external_url: 'https://replicate.com',
    capabilities: ['Model hosting', 'API deployment', 'Scaling', 'Pre-trained models'],
    source: 'AI Agents Directory'
  },
  {
    name: 'Banana.dev',
    description: 'Serverless GPU platform for ML model inference.',
    category: 'Infrastructure',
    external_url: 'https://banana.dev',
    capabilities: ['Serverless GPU', 'Model inference', 'Auto-scaling', 'API endpoint'],
    source: 'AI Agents Directory'
  },
  {
    name: 'Modal',
    description: 'Cloud platform for running Python functions on GPUs.',
    category: 'Infrastructure',
    external_url: 'https://modal.com',
    capabilities: ['GPU cloud', 'Serverless', 'Python functions', 'Distributed computing'],
    source: 'AI Agents Directory'
  },
  {
    name: 'Anyscale',
    description: 'Managed Ray platform for distributed AI applications.',
    category: 'Infrastructure',
    external_url: 'https://www.anyscale.com',
    capabilities: ['Ray platform', 'Distributed computing', 'Scaling', 'Managed service'],
    source: 'AI Agents Directory'
  },
  {
    name: 'Databricks',
    description: 'Unified data analytics and AI platform.',
    category: 'Enterprise',
    external_url: 'https://databricks.com',
    capabilities: ['Data analytics', 'ML platform', 'Collaboration', 'Enterprise'],
    source: 'AI Agents Directory'
  },
  {
    name: 'Snowflake AI',
    description: 'AI and ML capabilities on the data cloud.',
    category: 'Enterprise',
    external_url: 'https://www.snowflake.com',
    capabilities: ['Data warehouse', 'ML models', 'AI functions', 'Data sharing'],
    source: 'AI Agents Directory'
  },
  {
    name: 'Palantir Foundry',
    description: 'Enterprise data integration and AI platform.',
    category: 'Enterprise',
    external_url: 'https://www.palantir.com',
    capabilities: ['Data integration', 'AI/ML', 'Decision making', 'Enterprise'],
    source: 'AI Agents Directory'
  },
  {
    name: 'C3 AI',
    description: 'Enterprise AI application development and deployment.',
    category: 'Enterprise',
    external_url: 'https://c3.ai',
    capabilities: ['AI applications', 'Enterprise platform', 'Industry solutions', 'Deployment'],
    source: 'AI Agents Directory'
  },
  {
    name: 'SambaNova',
    description: 'AI infrastructure for large-scale model training and inference.',
    category: 'Infrastructure',
    external_url: 'https://sambanova.ai',
    capabilities: ['AI chips', 'Model training', 'Inference', 'High performance'],
    source: 'AI Agents Directory'
  },
  {
    name: 'Groq',
    description: 'LPUs for ultra-fast LLM inference.',
    category: 'Infrastructure',
    external_url: 'https://groq.com',
    capabilities: ['LPU inference', 'Fast inference', 'LLM optimization', 'API access'],
    source: 'AI Agents Directory'
  },
  {
    name: 'Inflection AI',
    description: 'Personal AI assistants for everyday tasks.',
    category: 'AI Assistant',
    external_url: 'https://inflection.ai',
    capabilities: ['Personal AI', 'Conversational', 'Productivity', 'Voice'],
    source: 'AI Agents Directory'
  },
  {
    name: 'Cohere',
    description: 'Enterprise AI platform for language models.',
    category: 'Development Framework',
    external_url: 'https://cohere.ai',
    capabilities: ['Language models', 'RAG', 'Search', 'Text generation'],
    source: 'AI Agents Directory'
  },
  {
    name: 'AI21 Labs',
    description: 'Jurassic language models for enterprise applications.',
    category: 'Development Framework',
    external_url: 'https://www.ai21.com',
    capabilities: ['Language models', 'Text generation', 'Summarization', 'Classification'],
    source: 'AI Agents Directory'
  },
  {
    name: 'Anthropic',
    description: 'AI safety and alignment research with Claude models.',
    category: 'Development Framework',
    external_url: 'https://www.anthropic.com',
    capabilities: ['Claude models', 'AI safety', 'Long context', 'Enterprise'],
    source: 'AI Agents Directory'
  },
  {
    name: 'OpenAI',
    description: 'Advanced AI research and GPT model development.',
    category: 'Development Framework',
    external_url: 'https://openai.com',
    capabilities: ['GPT models', 'API access', 'Research', 'Enterprise'],
    source: 'AI Agents Directory'
  },
  {
    name: 'DeepMind',
    description: 'AI research lab focused on AGI and scientific applications.',
    category: 'Research',
    external_url: 'https://deepmind.google',
    capabilities: ['AGI research', 'Scientific AI', 'AlphaFold', 'Reinforcement learning'],
    source: 'AI Agents Directory'
  },
  {
    name: 'Stability AI',
    description: 'Open-source AI models for image and video generation.',
    category: 'Image Generation',
    external_url: 'https://stability.ai',
    capabilities: ['Stable Diffusion', 'Image generation', 'Open source', 'Video'],
    source: 'AI Agents Directory'
  },
  {
    name: 'Runway',
    description: 'AI creative tools for video and image editing.',
    category: 'Video Generation',
    external_url: 'https://runwayml.com',
    capabilities: ['Video generation', 'Image editing', 'Motion tracking', 'Green screen'],
    source: 'AI Agents Directory'
  },
  {
    name: 'Leonardo AI',
    description: 'AI art generation and image editing platform.',
    category: 'Image Generation',
    external_url: 'https://leonardo.ai',
    capabilities: ['AI art', 'Image generation', 'Style control', 'Training'],
    source: 'AI Agents Directory'
  },
  {
    name: 'DALL-E 3',
    description: 'Advanced AI image generation from text descriptions.',
    category: 'Image Generation',
    external_url: 'https://openai.com/dall-e-3',
    capabilities: ['Text-to-image', 'High quality', 'Prompt understanding', 'Variations'],
    source: 'AI Agents Directory'
  },
  {
    name: 'Stable Video',
    description: 'Text-to-video generation from Stable Diffusion team.',
    category: 'Video Generation',
    external_url: 'https://stability.ai',
    capabilities: ['Text-to-video', 'Image animation', 'Open source', 'Custom models'],
    source: 'AI Agents Directory'
  },
  {
    name: 'Pika Labs',
    description: 'AI video generation and editing platform.',
    category: 'Video Generation',
    external_url: 'https://pika.art',
    capabilities: ['Video generation', 'Video editing', 'Animation', 'Effects'],
    source: 'AI Agents Directory'
  },
  {
    name: 'HeyGen',
    description: 'AI video generation with digital avatars and voice.',
    category: 'Video Generation',
    external_url: 'https://www.heygen.com',
    capabilities: ['Avatar video', 'Voice cloning', 'Translation', 'Templates'],
    source: 'AI Agents Directory'
  },
  {
    name: 'Synthesys',
    description: 'AI video and voice generation for content creators.',
    category: 'Video Generation',
    external_url: 'https://synthesys.io',
    capabilities: ['Video generation', 'Voice synthesis', 'Avatars', 'Multi-language'],
    source: 'AI Agents Directory'
  },
  {
    name: 'InVideo AI',
    description: 'AI video creation from text prompts.',
    category: 'Video Generation',
    external_url: 'https://invideo.io',
    capabilities: ['Text-to-video', 'Stock footage', 'Voiceover', 'Templates'],
    source: 'AI Agents Directory'
  },
  {
    name: 'Fliki',
    description: 'AI text-to-video and text-to-speech platform.',
    category: 'Video Generation',
    external_url: 'https://fliki.ai',
    capabilities: ['Text-to-video', 'Voice generation', 'Blog to video', 'Templates'],
    source: 'AI Agents Directory'
  },
  {
    name: 'Murf',
    description: 'AI voice generator for professional audio.',
    category: 'Audio Generation',
    external_url: 'https://murf.ai',
    capabilities: ['Text-to-speech', 'Voice cloning', 'Multi-language', 'Podcast'],
    source: 'AI Agents Directory'
  },
  {
    name: 'Resemble AI',
    description: 'AI voice cloning and synthesis platform.',
    category: 'Audio Generation',
    external_url: 'https://resemble.ai',
    capabilities: ['Voice cloning', 'Speech synthesis', 'Real-time', 'Emotion control'],
    source: 'AI Agents Directory'
  },
  {
    name: 'Play.ht',
    description: 'AI voice generation and text-to-speech API.',
    category: 'Audio Generation',
    external_url: 'https://play.ht',
    capabilities: ['Text-to-speech', 'Voice cloning', 'API', 'Podcast'],
    source: 'AI Agents Directory'
  },
  {
    name: 'Lovo.ai',
    description: 'AI voice generator with emotional speech.',
    category: 'Audio Generation',
    external_url: 'https://lovo.ai',
    capabilities: ['Voice generation', 'Emotional speech', 'Dubbing', 'Podcast'],
    source: 'AI Agents Directory'
  },
  {
    name: 'Speechify',
    description: 'AI text-to-speech for reading and accessibility.',
    category: 'Audio Generation',
    external_url: 'https://speechify.com',
    capabilities: ['Text-to-speech', 'Reading', 'Accessibility', 'Multi-platform'],
    source: 'AI Agents Directory'
  }
];

function seedAgents() {
  console.log('🌱 Seeding agents from public directories...');
  
  const conn = db.db;
  
  // Clear existing community listings
  conn.exec("DELETE FROM agents WHERE status = 'pending'");
  console.log('✅ Cleared existing pending listings');
  
  let inserted = 0;
  const now = Date.now();
  
  agents.forEach(agent => {
    try {
      const stmt = conn.prepare(`
        INSERT INTO agents (
          operator_id, name, description, capabilities, 
          endpoint_url, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
      `);
      
      stmt.run(
        null, // No operator (community listing)
        agent.name,
        agent.description,
        JSON.stringify(agent.capabilities),
        agent.external_url,
        now,
        now
      );
      inserted++;
    } catch (err) {
      console.error(`❌ Error inserting ${agent.name}:`, err.message);
    }
  });
  
  console.log(`✅ Inserted ${inserted} community listings`);
  
  // Create categories if they don't exist
  const categories = [
    { name: 'Development Framework', slug: 'development-framework' },
    { name: 'Multi-Agent', slug: 'multi-agent' },
    { name: 'No-Code', slug: 'no-code' },
    { name: 'Development Platform', slug: 'development-platform' },
    { name: 'Chat Interface', slug: 'chat-interface' },
    { name: 'Automation', slug: 'automation' },
    { name: 'Search', slug: 'search' },
    { name: 'AI Assistant', slug: 'ai-assistant' },
    { name: 'Image Generation', slug: 'image-generation' },
    { name: 'Video Editing', slug: 'video-editing' },
    { name: 'Content Creation', slug: 'content-creation' },
    { name: 'Productivity', slug: 'productivity' },
    { name: 'Video Generation', slug: 'video-generation' },
    { name: 'Audio Generation', slug: 'audio-generation' },
    { name: 'Chatbot', slug: 'chatbot' },
    { name: 'Enterprise', slug: 'enterprise' },
    { name: 'Sales', slug: 'sales' },
    { name: 'Customer Support', slug: 'customer-support' },
    { name: 'Analytics', slug: 'analytics' },
    { name: 'Infrastructure', slug: 'infrastructure' },
    { name: 'Research', slug: 'research' }
  ];
  
  categories.forEach(cat => {
    try {
      conn.run(`
        INSERT OR IGNORE INTO categories (name, slug) VALUES (?, ?)
      `, [cat.name, cat.slug]);
    } catch (err) {
      console.error(`❌ Error inserting category ${cat.name}:`, err.message);
    }
  });
  
  console.log(`✅ Created ${categories.length} categories`);
  
  // Link agents to categories
  const categoryMap = {};
  const catStmt = conn.prepare('SELECT id FROM categories WHERE slug = ?');
  
  categories.forEach(cat => {
    const catRow = catStmt.get(cat.slug);
    if (catRow) {
      categoryMap[cat.name] = catRow.id;
    }
  });
  
  let linked = 0;
  agents.forEach(agent => {
    const catId = categoryMap[agent.category];
    if (catId) {
      try {
        conn.run(
          'INSERT OR IGNORE INTO agent_categories (agent_id, category_id) VALUES ((SELECT id FROM agents WHERE name = ?), ?)',
          [agent.name, catId]
        );
        linked++;
      } catch (err) {
        console.error(`❌ Error linking ${agent.name}:`, err.message);
      }
    }
  });
  
  console.log(`✅ Linked ${linked} agents to categories`);
  
  // No need to close - db is singleton
  console.log('🎉 Seeding complete!');
  console.log(`\nTotal community listings: ${inserted}`);
  console.log('These will appear in browse page with "Claim this listing" button');
}

seedAgents();