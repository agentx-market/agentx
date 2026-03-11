const { execSync } = require('child_process');

// Get Marco's LIGHTNING_WALLET_API_KEY from environment
const LIGHTNING_WALLET_API_KEY = process.env.LIGHTNING_WALLET_API_KEY;
if (!LIGHTNING_WALLET_API_KEY) { console.error('Set LIGHTNING_WALLET_API_KEY env var'); }
const WELCOME_BONUS_SATS = parseInt(process.env.LW_WELCOME_BONUS_SATS || '21', 10);

function execLwCommand(command) {
  return execSync(command, {
    encoding: 'utf-8',
    env: { ...process.env, LIGHTNING_WALLET_API_KEY }
  });
}

function parseWalletId(output) {
  try {
    const data = JSON.parse(output);
    return data.agent_id || data.id || null;
  } catch (parseErr) {
    const match = output.match(/"agent_id"\s*:\s*"?([^"\s}]+)"?/);
    return match ? match[1] : null;
  }
}

function registerAgentWallet(agentName) {
  try {
    // Use create-agent command to create a sub-wallet for the agent
    const output = execLwCommand(`lw create-agent "${agentName}"`);
    const wallet_id = parseWalletId(output);

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

function registerOperatorWallet(operatorLabel) {
  return registerAgentWallet(`operator-${operatorLabel}`);
}

function sendWelcomeBonus(agent_id, amount_sats = WELCOME_BONUS_SATS) {
  try {
    // Use fund-agent command to send welcome bonus
    const output = execLwCommand(`lw fund-agent ${agent_id} ${amount_sats}`);
    console.log(`[wallet] Sent ${amount_sats} sats to agent ${agent_id}`);
    return { success: true, sats: amount_sats, output };
  } catch (err) {
    console.error(`[wallet] Failed to send bonus: ${err.message}`);
    throw new Error(`Bonus send failed: ${err.message}`);
  }
}

function getWalletInfo(wallet_id) {
  try {
    const output = execLwCommand(`lw balance --agent ${wallet_id}`);
    return output.trim();
  } catch (err) {
    console.error(`[wallet] Failed to get balance: ${err.message}`);
    return null;
  }
}

function getWalletBalance(wallet_id) {
  const info = getWalletInfo(wallet_id);
  if (!info) return null;

  const normalized = info.trim();
  if (/^\d+$/.test(normalized)) {
    return Number.parseInt(normalized, 10);
  }

  try {
    const parsed = JSON.parse(normalized);
    if (typeof parsed.balance_sats === 'number') return parsed.balance_sats;
    if (typeof parsed.balance === 'number') return parsed.balance;
  } catch (parseErr) {
    const match = normalized.match(/(\d+)\s*sats?/i);
    if (match) return Number.parseInt(match[1], 10);
  }

  return null;
}

function transferBetweenAgents(fromWalletId, toWalletId, amountSats, description = '') {
  try {
    // Use transfer-to-agent command (from lightning-wallet-mcp v1.0.3+)
    // This automatically applies 2% platform fee
    const output = execLwCommand(
      `lw transfer-to-agent ${fromWalletId} ${toWalletId} ${amountSats} "${description}"`,
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

module.exports = {
  registerAgentWallet,
  registerOperatorWallet,
  sendWelcomeBonus,
  getWalletInfo,
  getWalletBalance,
  transferBetweenAgents,
  WELCOME_BONUS_SATS
};
