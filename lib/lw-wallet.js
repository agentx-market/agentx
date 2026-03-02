const { execSync } = require('child_process');

// Get Marco's LIGHTNING_WALLET_API_KEY from environment
const LIGHTNING_WALLET_API_KEY = process.env.LIGHTNING_WALLET_API_KEY || 'REDACTED';
const WELCOME_BONUS_SATS = parseInt(process.env.LW_WELCOME_BONUS_SATS || '21', 10);

function registerAgentWallet(agentName) {
  try {
    // Use create-agent command to create a sub-wallet for the agent
    const output = execSync(`lw create-agent "${agentName}"`, {
      encoding: 'utf-8',
      env: { ...process.env, LIGHTNING_WALLET_API_KEY }
    });
    
    // Parse JSON output: expect { agent_id: <id>, ... }
    let wallet_id;
    try {
      const data = JSON.parse(output);
      wallet_id = data.agent_id || data.id;
    } catch (parseErr) {
      // Fallback: try to extract agent_id from text
      const match = output.match(/"agent_id"\s*:\s*(\d+)/);
      wallet_id = match ? parseInt(match[1], 10) : null;
    }
    
    if (!wallet_id) {
      throw new Error(`Could not parse wallet_id from lw output: ${output}`);
    }
    
    console.log(`[wallet] Registered wallet for ${agentName}: ${wallet_id}`);
    return wallet_id;
  } catch (err) {
    console.error(`[wallet] Failed to register: ${err.message}`);
    throw new Error(`Wallet registration failed: ${err.message}`);
  }
}

function sendWelcomeBonus(agent_id, amount_sats = WELCOME_BONUS_SATS) {
  try {
    // Use fund-agent command to send welcome bonus
    const output = execSync(`lw fund-agent ${agent_id} ${amount_sats}`, {
      encoding: 'utf-8',
      env: { ...process.env, LIGHTNING_WALLET_API_KEY }
    });
    console.log(`[wallet] Sent ${amount_sats} sats to agent ${agent_id}`);
    return { success: true, sats: amount_sats, output };
  } catch (err) {
    console.error(`[wallet] Failed to send bonus: ${err.message}`);
    throw new Error(`Bonus send failed: ${err.message}`);
  }
}

function getWalletInfo(wallet_id) {
  try {
    const output = execSync(`lw balance --agent ${wallet_id}`, {
      encoding: 'utf-8',
      env: { ...process.env, LIGHTNING_WALLET_API_KEY }
    });
    return output.trim();
  } catch (err) {
    console.error(`[wallet] Failed to get balance: ${err.message}`);
    return null;
  }
}

function transferBetweenAgents(fromWalletId, toWalletId, amountSats, description = '') {
  try {
    // Use transfer-to-agent command (from lightning-wallet-mcp v1.0.3+)
    // This automatically applies 2% platform fee
    const output = execSync(
      `lw transfer-to-agent ${fromWalletId} ${toWalletId} ${amountSats} "${description}"`,
      {
        encoding: 'utf-8',
        env: { ...process.env, LIGHTNING_WALLET_API_KEY }
      }
    );
    
    // Parse JSON output: expect { success, payment_hash, amount_sats, platform_fee_sats, total_cost, ... }
    let result;
    try {
      result = JSON.parse(output);
    } catch (parseErr) {
      console.error(`[wallet] Failed to parse transfer output: ${output}`);
      throw new Error(`Transfer completed but response parsing failed: ${output}`);
    }
    
    console.log(
      `[wallet] Transfer ${fromWalletId} → ${toWalletId}: ${amountSats} sats, ` +
      `fee: ${result.platform_fee_sats || 0} sats`
    );
    return result;
  } catch (err) {
    console.error(`[wallet] Transfer failed: ${err.message}`);
    throw new Error(`Transfer failed: ${err.message}`);
  }
}

module.exports = { registerAgentWallet, sendWelcomeBonus, getWalletInfo, transferBetweenAgents, WELCOME_BONUS_SATS };
