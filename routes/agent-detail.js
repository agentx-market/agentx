const express = require('express');
const db = require('../db');
const { calculateUptime } = require('../lib/uptime-calc');
const router = express.Router();

router.get('/agents/:slug', async (req, res) => {
  const { slug } = req.params;
  
  try {
    // Fetch agent from database by slug
    const agent = await db.get('SELECT * FROM agents WHERE slug = ?', [slug]);
    if (!agent) {
      return res.status(404).render('agent-not-found', { slug });
    }

    // Fetch agent capabilities
    const capabilities = await db.all(
      'SELECT * FROM agent_capabilities WHERE agent_id = ? ORDER BY name ASC',
      [agent.id]
    );

    // Fetch agent categories/tags
    const agentCategories = await db.all(
      `SELECT c.* FROM categories c
       JOIN agent_categories ac ON c.id = ac.category_id
       WHERE ac.agent_id = ?
       ORDER BY c.name ASC`,
      [agent.id]
    );

    // Calculate uptime percentage (last 30 days)
    const uptimeResult = calculateUptime(agent.id);
    const uptime = uptimeResult.uptimePercent;

    // Fetch usage stats
    const usageStats = await db.get(
      'SELECT COUNT(*) as total_requests, SUM(response_time_ms) as total_response_time FROM agent_requests WHERE agent_id = ? AND created_at > datetime("now", "-30 days")',
      [agent.id]
    );

    // Render agent detail page
    res.render('agent-detail', {
      agent,
      capabilities,
      uptime,
      usageStats: usageStats || { total_requests: 0, total_response_time: 0 },
      avgResponseTime: usageStats?.total_response_time ? Math.round(usageStats.total_response_time / usageStats.total_requests) : 0
    });
  } catch (err) {
    console.error(`[agent-detail] Error: ${err.message}`);
    res.status(500).render('error', { message: 'Failed to load agent details' });
  }
});

module.exports = router;
