#!/usr/bin/env node

// Test script to verify agents load correctly
const https = require('https');

function testBrowsePage() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/browse',
      method: 'GET'
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          
          console.log('Total agents:', jsonData.total);
          console.log('\nAgents found:');
          jsonData.agents.forEach(agent => {
            console.log(`  - ${agent.name} (${agent.slug}) - ${agent.category} - ${agent.uptime_percent}% uptime`);
          });
          
          if (jsonData.agents.length === 0) {
            console.log('\n❌ ERROR: No agents found!');
            process.exit(1);
          }
          
          if (jsonData.agents.length < 6) {
            console.log(`\n⚠️  WARNING: Only ${jsonData.agents.length} agents found, expected at least 6`);
            process.exit(1);
          }
          
          console.log('\n✅ SUCCESS: All agents loaded correctly!');
          process.exit(0);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

testBrowsePage().catch(error => {
  console.error('\n❌ ERROR:', error.message);
  process.exit(1);
});