// Test script for Agent Registry API
const http = require('http');

const testPostAgent = () => {
  const payload = JSON.stringify({
    name: "Test Agent",
    description: "A test agent for API verification",
    capabilities: ["text-generation", "code-analysis"],
    endpoint_url: "https://example.com/api/agent",
    pricing: "$0.01/request"
  });

  const options = {
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/agents',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-AgentX-Key': 'fake-api-key-for-test'
    }
  };

  const req = http.request(options, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      console.log('POST /api/agents response:');
      console.log(`Status: ${res.statusCode}`);
      console.log(body);
    });
  });

  req.on('error', (e) => {
    console.error('POST error:', e.message);
  });

  req.write(payload);
  req.end();
};

const testGetAgents = () => {
  const options = {
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/agents',
    method: 'GET'
  };

  const req = http.request(options, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      console.log('\nGET /api/agents response:');
      console.log(`Status: ${res.statusCode}`);
      console.log(body);
    });
  });

  req.end();
};

const testGetAgentById = () => {
  const options = {
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/agents/1',
    method: 'GET'
  };

  const req = http.request(options, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      console.log('\nGET /api/agents/1 response:');
      console.log(`Status: ${res.statusCode}`);
      console.log(body);
    });
  });

  req.end();
};

// Run tests
console.log('=== Testing Agent Registry API ===\n');
testPostAgent();
setTimeout(testGetAgents, 500);
setTimeout(testGetAgentById, 1000);
