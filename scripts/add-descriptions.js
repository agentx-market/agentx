const db = require('../db');

// Agent descriptions mapping (IDs from registration)
const descriptions = {
  320: 'Operator account for AgentX.Market administration, user management, and analytics oversight.',
  321: 'Meta\'s latest open-weight large language model with enhanced reasoning capabilities, multilingual support, and improved instruction following. Built for production use cases requiring high-quality text generation.',
  322: 'Mistral AI\'s compact and efficient multilingual reasoning model. Optimized for deployment in resource-constrained environments while maintaining strong performance on complex tasks.',
  323: 'High-performance language model from DeepSeek optimized for complex reasoning, mathematical problem-solving, and code generation. Features large context window support.',
  324: 'Alibaba\'s specialized coding-focused variant of the Qwen2.5 series. Enhanced with improved programming capabilities, code completion, and debugging assistance.',
  325: 'Google\'s lightweight but powerful open-weight model in a 9B parameter configuration. Designed for efficient deployment on consumer hardware while maintaining strong performance.',
  326: 'Microsoft\'s compact instruction-tuned model from the Phi series. Optimized for efficient on-device and cloud inference with excellent instruction following capabilities.',
  327: 'xAI\'s high-performance reasoning model featuring real-time data access, search integration, and enhanced natural language understanding capabilities.',
  328: 'ZeroGPT\'s fastest reasoning model designed for quick inference and cost-effective deployments. Balances speed with quality for production use.',
  329: 'Cohere\'s enterprise-grade model specifically optimized for Retrieval-Augmented Generation (RAG) and production use cases requiring high reliability.',
  330: 'Anthropic\'s fastest Claude model variant designed for quick, cost-effective reasoning and task completion while maintaining strong safety and alignment.',
  331: 'Perplexity\'s research-oriented model featuring live web search integration for accurate information retrieval, citations, and up-to-date knowledge.'
};

const stmt = db.prepare('UPDATE agents SET description = ? WHERE id = ?');

Object.entries(descriptions).forEach(([id, desc]) => {
  try {
    stmt.run(desc, parseInt(id));
    console.log(`✅ Agent #${id}: Description updated`);
  } catch (e) {
    console.error(`❌ Agent #${id}: Failed - ${e.message}`);
  }
});

console.log('\\n📊 Summary:');
const agents = db.prepare('SELECT id, name, SUBSTR(description, 1, 50) as desc FROM agents WHERE id IN (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').all(320, 321, 322, 323, 324, 325, 326, 327, 328, 329, 330);
console.log('\\nRegistered agents with live health endpoints:');
agents.forEach(a => console.log(`   ${a.id}. ${a.name}: ${a.desc}...`));

db.close();
