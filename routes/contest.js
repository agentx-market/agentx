const express = require('express');
const router = express.Router();
const db = require('../db');
const { body, validationResult } = require('express-validator');

// Middleware: Check if user is authenticated
const requireAuth = (req, res, next) => {
  if (!req.operatorId) {
    return res.redirect('/login');
  }
  next();
};

// IP-based spam prevention for voting
function checkVotingSpam(ipAddress, operatorId) {
  // Check if operator already voted in current month
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  
  const checkStmt = db.prepare(`
    SELECT COUNT(*) as vote_count, MAX(voted_at) as last_vote
    FROM contest_votes
    WHERE ip_address = ? AND (operator_id = ? OR operator_id IS NULL)
    AND voted_at >= ?
  `);
  
  const result = checkStmt.get(ipAddress, operatorId, Date.now() - 24 * 60 * 60 * 1000); // Last 24 hours
  
  if (result.vote_count > 5) {
    return { allowed: false, reason: 'Rate limit exceeded' };
  }
  
  // Check if already voted this month for specific agent
  const monthCheck = db.prepare(`
    SELECT COUNT(*) as count FROM contest_votes
    WHERE operator_id = ? AND voted_at >= ? AND status = 'valid'
  `).get(operatorId, new Date(currentMonth + '-01').getTime());
  
  if (monthCheck.count > 2) {
    return { allowed: false, reason: 'Monthly vote limit reached' };
  }
  
  return { allowed: true };
}

// GET /api/contest - Get contest status and current month's nominees
router.get('/api/contest', async (req, res) => {
  try {
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    
    // Get active nominee count for this month
    const nomineeCount = db.prepare(`
      SELECT COUNT(*) as count FROM contest_nominees 
      WHERE nominated_at >= ? AND status = 'active'
    `).get(currentMonth);
    
    // Get top nominees by votes for this month
    const topNominees = db.prepare(`
      SELECT 
        a.id, a.name, a.description, a.endpoint_url,
        COUNT(cv.id) as vote_count,
        cn.reason
      FROM agents a
      INNER JOIN contest_nominees cn ON a.id = cn.agent_id
      LEFT JOIN contest_votes cv ON a.id = cv.agent_id AND cv.status = 'valid'
      WHERE cn.nominated_at >= ? AND cn.status = 'active'
      GROUP BY a.id
      ORDER BY vote_count DESC, a.rating DESC
      LIMIT 10
    `).all(currentMonth);
    
    // Get winner from previous month
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const lastMonthStr = lastMonth.toISOString().slice(0, 7);
    
    const winner = db.prepare(`
      SELECT 
        a.id, a.name, a.description, a.endpoint_url, a.pricing,
        COUNT(cv.id) as vote_count
      FROM agents a
      INNER JOIN contest_nominees cn ON a.id = cn.agent_id
      LEFT JOIN contest_votes cv ON a.id = cv.agent_id AND cv.status = 'valid'
      WHERE cn.nominated_at >= ? AND cn.nominated_at < ? AND cn.status = 'winner'
      GROUP BY a.id
      ORDER BY vote_count DESC
      LIMIT 1
    `).get(lastMonthStr, currentMonth);
    
    res.json({
      status: 'active',
      currentMonth: currentMonth,
      nomineeCount: nomineeCount.count,
      topNominees: topNominees,
      winner: winner || null
    });
  } catch (err) {
    console.error('[contest] Error fetching contest data:', err);
    res.status(500).json({ error: 'Failed to fetch contest data' });
  }
});

// POST /api/contest/nominate - Submit a nomination
router.post('/api/contest/nominate', requireAuth, [
  body('agentSlug')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Agent slug is required'),
  body('reason')
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('Reason must be 10-500 characters')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  try {
    const agentSlug = req.body.agentSlug;
    const reason = req.body.reason;
    const operatorId = req.operatorId;
    
    // Find agent by slug (derived from name)
    const agent = db.prepare(`
      SELECT * FROM agents WHERE LOWER(REPLACE(name, ' ', '-')) = ? OR name ILIKE '%' || ? || '%'
      LIMIT 1
    `).get(agentSlug, agentSlug);
    
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    // Check if already nominated this month
    const currentMonth = new Date().toISOString().slice(0, 7);
    const existingNomination = db.prepare(`
      SELECT * FROM contest_nominees
      WHERE agent_id = ? AND operator_id = ? 
      AND nominated_at >= ? AND status != 'winner'
    `).get(agent.id, operatorId, currentMonth);
    
    if (existingNomination) {
      // Update existing nomination
      db.prepare(`
        UPDATE contest_nominees SET reason = ?, updated_at = ?
        WHERE id = ?
      `).run(reason, Date.now(), existingNomination.id);
      
      return res.json({ 
        message: 'Nomination updated successfully',
        nominationId: existingNomination.id 
      });
    }
    
    // Check if already nominated by another user this month (for same agent)
    const previousNominee = db.prepare(`
      SELECT * FROM contest_nominees
      WHERE agent_id = ? AND status = 'active'
      AND nominated_at >= ?
    `).get(agent.id, currentMonth);
    
    if (previousNominee) {
      return res.status(400).json({ 
        error: 'This agent was already nominated this month by another operator' 
      });
    }
    
    // Create new nomination
    db.prepare(`
      INSERT INTO contest_nominees (agent_id, operator_id, reason, status, created_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, ?)
    `).run(agent.id, operatorId, reason, Date.now(), Date.now());
    
    // Send notification to admin
    const admins = db.prepare(`
      SELECT id, email, name FROM operators WHERE verified = 1
    `).all();
    
    console.log(`[contest] New nomination: ${agent.name} by ${operatorId}`);
    
    res.json({ 
      message: 'Nomination submitted successfully!',
      nominationId: db.prepare('SELECT last_insert_rowid() as id').get().id
    });
  } catch (err) {
    console.error('[contest] Error submitting nomination:', err);
    res.status(500).json({ error: 'Failed to submit nomination' });
  }
});

// POST /api/contest/vote - Submit a vote
router.post('/api/contest/vote', [
  body('agentSlug')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Agent slug is required'),
  // Optional operator_id if already authenticated via session
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  try {
    const agentSlug = req.body.agentSlug;
    const operatorId = req.operatorId || req.body.operator_id;
    const ipAddress = req.ip || req.connection.remoteAddress;
    
    // Find agent by slug
    const agent = db.prepare(`
      SELECT * FROM agents WHERE LOWER(REPLACE(name, ' ', '-')) = ? OR name ILIKE '%' || ? || '%'
      LIMIT 1
    `).get(agentSlug, agentSlug);
    
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    // Check for spam/voting limits
    const spamCheck = checkVotingSpam(ipAddress, operatorId);
    if (!spamCheck.allowed) {
      return res.status(429).json({ error: spamCheck.reason });
    }
    
    // Get current month
    const currentMonth = new Date().toISOString().slice(0, 7);
    
    // Check if already voted this month
    const existingVote = db.prepare(`
      SELECT * FROM contest_votes
      WHERE (operator_id = ? OR operator_id IS NULL)
      AND agent_id = ?
      AND voted_at >= ?
      LIMIT 1
    `).get(operatorId, agent.id, new Date(currentMonth + '-01').getTime());
    
    if (existingVote) {
      return res.status(400).json({ 
        error: 'You have already voted for this agent this month',
        voteId: existingVote.id
      });
    }
    
    // Create vote record
    db.prepare(`
      INSERT INTO contest_votes (operator_id, ip_address, agent_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'valid', ?, ?)
    `).run(operatorId || null, ipAddress, agent.id, Date.now(), Date.now());
    
    // Count total votes for this agent
    const voteCount = db.prepare(`
      SELECT COUNT(*) as count FROM contest_votes
      WHERE agent_id = ? AND status = 'valid' AND voted_at >= ?
    `).get(agent.id, new Date(currentMonth + '-01').getTime());
    
    console.log(`[contest] New vote for: ${agent.name} (total: ${voteCount.count})`);
    
    res.json({ 
      message: 'Vote recorded successfully!',
      totalVotes: voteCount.count
    });
  } catch (err) {
    console.error('[contest] Error submitting vote:', err);
    res.status(500).json({ error: 'Failed to submit vote' });
  }
});

// GET /api/contest/stats - Get contest statistics
router.get('/api/contest/stats', async (req, res) => {
  try {
    const currentMonth = new Date().toISOString().slice(0, 7);
    
    // Total votes this month
    const totalVotes = db.prepare(`
      SELECT COUNT(*) as count FROM contest_votes
      WHERE voted_at >= ? AND status = 'valid'
    `).get(currentMonth);
    
    // Top agents by votes
    const topAgents = db.prepare(`
      SELECT 
        a.id, a.name, a.description,
        COUNT(cv.id) as vote_count
      FROM agents a
      LEFT JOIN contest_votes cv ON a.id = cv.agent_id AND cv.status = 'valid'
      WHERE cv.voted_at >= ?
      GROUP BY a.id
      ORDER BY vote_count DESC
      LIMIT 5
    `).all(currentMonth);
    
    res.json({
      currentMonth: currentMonth,
      totalVotes: totalVotes.count || 0,
      topAgents: topAgents
    });
  } catch (err) {
    console.error('[contest] Error fetching contest stats:', err);
    res.status(500).json({ error: 'Failed to fetch contest statistics' });
  }
});

module.exports = router;
