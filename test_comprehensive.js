#!/usr/bin/env node

const axios = require('axios');

const API_BASE = 'http://127.0.0.1:3000/api';

async function comprehensiveTest() {
  console.log('=== Comprehensive Agent Registry API Test ===\n');
  
  let allPassed = true;
  
  // Test 1: GET /api/agents returns array
  console.log('Test 1: GET /api/agents returns array of agents');
  try {
    const response = await axios.get(`${API_BASE}/agents`);
    if (!Array.isArray(response.data)) {
      console.log('✗ Failed: Response is not an array');
      allPassed = false;
    } else if (response.data.length === 0) {
      console.log('✗ Failed: No agents found');
      allPassed = false;
    } else {
      console.log(`✓ Passed: ${response.data.length} agents returned`);
    }
  } catch (err) {
    console.log(`✗ Failed: ${err.message}`);
    allPassed = false;
  }
  
  // Test 2: GET /api/agents/:id returns single agent
  console.log('\nTest 2: GET /api/agents/:id returns single agent');
  try {
    const response = await axios.get(`${API_BASE}/agents/3`);
    if (typeof response.data !== 'object' || response.data.id !== 3) {
      console.log('✗ Failed: Response is not a single agent object');
      allPassed = false;
    } else {
      console.log(`✓ Passed: Agent ${response.data.name} (ID: ${response.data.id})`);
    }
  } catch (err) {
    console.log(`✗ Failed: ${err.message}`);
    allPassed = false;
  }
  
  // Test 3: Verify all required fields are present
  console.log('\nTest 3: Verify required fields in agent object');
  try {
    const response = await axios.get(`${API_BASE}/agents/3`);
    const agent = response.data;
    const requiredFields = ['id', 'operator_id', 'name', 'description', 'capabilities', 'endpoint_url', 'pricing', 'status'];
    const missingFields = requiredFields.filter(field => !(field in agent));
    
    if (missingFields.length > 0) {
      console.log(`✗ Failed: Missing fields: ${missingFields.join(', ')}`);
      allPassed = false;
    } else {
      console.log('✓ Passed: All required fields present');
      console.log(`  - id: ${agent.id}`);
      console.log(`  - name: ${agent.name}`);
      console.log(`  - description: ${agent.description.substring(0, 40)}...`);
      console.log(`  - capabilities: ${Array.isArray(agent.capabilities) ? agent.capabilities.length + ' items' : 'N/A'}`);
      console.log(`  - endpoint_url: ${agent.endpoint_url}`);
      console.log(`  - pricing: ${agent.pricing}`);
      console.log(`  - status: ${agent.status}`);
    }
  } catch (err) {
    console.log(`✗ Failed: ${err.message}`);
    allPassed = false;
  }
  
  // Test 4: Verify capabilities is JSON array
  console.log('\nTest 4: Verify capabilities is JSON array');
  try {
    const response = await axios.get(`${API_BASE}/agents/3`);
    if (!Array.isArray(response.data.capabilities)) {
      console.log('✗ Failed: capabilities is not an array');
      allPassed = false;
    } else {
      console.log(`✓ Passed: capabilities is array with ${response.data.capabilities.length} items`);
    }
  } catch (err) {
    console.log(`✗ Failed: ${err.message}`);
    allPassed = false;
  }
  
  // Test 5: Verify POST endpoint exists (check status code)
  console.log('\nTest 5: Verify POST /api/agents endpoint exists');
  try {
    // We won't actually post without auth, just check if endpoint responds
    const response = await axios.post(`${API_BASE}/agents`, {}, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    // Should return 401 for unauthenticated request
    if (response.status === 401) {
      console.log('✓ Passed: POST endpoint requires authentication (as expected)');
    } else {
      console.log('✗ Failed: Unexpected response');
      allPassed = false;
    }
  } catch (err) {
    if (err.response && err.response.status === 401) {
      console.log('✓ Passed: POST endpoint requires authentication (as expected)');
    } else {
      console.log(`✗ Failed: ${err.message}`);
      allPassed = false;
    }
  }
  
  console.log('\n=== Test Summary ===');
  if (allPassed) {
    console.log('✓ All tests passed! Agent Registry API is working correctly.');
  } else {
    console.log('✗ Some tests failed. Please review the implementation.');
  }
  
  return allPassed;
}

comprehensiveTest().then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});