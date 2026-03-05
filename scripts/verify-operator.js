#!/usr/bin/env node
// Verification script for operator verification
// Methods: (1) domain ownership check, (2) GitHub org membership match

const db = require('../db');
const https = require('https');

/**
 * Check if agent endpoint domain matches operator's domain
 * @param {string} endpointUrl - Agent's endpoint URL
 * @param {string} operatorDomain - Operator's domain to verify against
 * @returns {boolean}
 */
function checkDomainOwnership(endpointUrl, operatorDomain) {
  try {
    const url = new URL(endpointUrl);
    const endpointDomain = url.hostname.toLowerCase();
    const normalizedOperatorDomain = operatorDomain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
    
    return endpointDomain === normalizedOperatorDomain || 
           endpointDomain.endsWith('.' + normalizedOperatorDomain);
  } catch (err) {
    console.error('Invalid endpoint URL:', endpointUrl);
    return false;
  }
}

/**
 * Check if operator is a member of a GitHub organization
 * @param {string} githubUsername - Operator's GitHub username
 * @param {string} orgName - GitHub organization name
 * @param {string} token - GitHub personal access token (optional)
 * @returns {Promise<boolean>}
 */
async function checkGitHubOrgMembership(githubUsername, orgName, token = null) {
  return new Promise((resolve) => {
    const url = `https://api.github.com/orgs/${orgName}/members/${githubUsername}`;
    const options = {
      hostname: 'api.github.com',
      path: `/orgs/${orgName}/members/${githubUsername}`,
      method: 'GET',
      headers: {
        'User-Agent': 'AgentX-Verification',
        'Accept': 'application/vnd.github.v3+json'
      }
    };

    if (token) {
      options.headers['Authorization'] = `token ${token}`;
    }

    const req = https.request(options, (res) => {
      resolve(res.statusCode === 204 || res.statusCode === 200);
    });

    req.on('error', (err) => {
      console.error('GitHub API error:', err.message);
      resolve(false);
    });

    req.end();
  });
}

/**
 * Verify an operator based on their agent's endpoint
 * @param {string} operatorId - Operator ID
 * @param {string} verificationMethod - 'domain' or 'github'
 * @param {string} verificationData - Domain or GitHub org name
 * @returns {boolean}
 */
async function verifyOperator(operatorId, verificationMethod, verificationData) {
  const agent = db.prepare('SELECT * FROM agents WHERE operator_id = ? AND status = \'active\' LIMIT 1').get(operatorId);
  
  if (!agent) {
    console.log('No active agent found for operator:', operatorId);
    return false;
  }

  let verified = false;

  if (verificationMethod === 'domain') {
    verified = checkDomainOwnership(agent.endpoint_url, verificationData);
    console.log(`Domain verification for ${operatorId}: ${verified ? 'PASSED' : 'FAILED'}`);
  } else if (verificationMethod === 'github') {
    const operator = db.prepare('SELECT github_username FROM operators WHERE id = ?').get(operatorId);
    if (operator && operator.github_username) {
      verified = await checkGitHubOrgMembership(operator.github_username, verificationData);
      console.log(`GitHub org verification for ${operatorId}: ${verified ? 'PASSED' : 'FAILED'}`);
    }
  }

  if (verified) {
    db.prepare('UPDATE operators SET verified = 1, verification_method = ?, verified_at = ? WHERE id = ?')
      .run(verificationMethod, Date.now(), operatorId);
    console.log(`Operator ${operatorId} verified via ${verificationMethod}`);
  }

  return verified;
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.log('Usage: node verify-operator.js <operatorId> <method> <data>');
    console.log('Methods: domain, github');
    console.log('Examples:');
    console.log('  node verify-operator.js op123 domain example.com');
    console.log('  node verify-operator.js op123 github my-org');
    process.exit(1);
  }

  const [operatorId, method, data] = args;
  verifyOperator(operatorId, method, data)
    .then(success => process.exit(success ? 0 : 1))
    .catch(err => {
      console.error('Verification failed:', err);
      process.exit(1);
    });
}

module.exports = { checkDomainOwnership, checkGitHubOrgMembership, verifyOperator };