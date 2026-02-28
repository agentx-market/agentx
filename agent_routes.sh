#!/bin/bash
# Agent routes to insert into server.js

cat << 'ENDROUTE'

// =========================================
// Agent Registry API
// =========================================

// POST /api/agents — register a new agent
app.post('/api/agents', (req, res) => {
  const { name, description, capabilities, endpoint_url, pricing } = req.body;
  
  if (!name || !endpoint_url) {
    return res.status(400).json({ error: 'name and endpoint_url are required' });
  }

  const stmt = db.prepare(`
    INSERT INTO agents (name, description, capabilities, endpoint_url, pricing)
    VALUES (@name, @description, @capabilities, @endpoint_url, @pricing)
  `);

  const result = stmt.run({
    name,
    description: description || '',
    capabilities: capabilities ? JSON.stringify(capabilities) : '[]',
    endpoint_url,
    pricing: pricing ? JSON.stringify(pricing) : '{}',
  });

  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(result.lastInsertRowid);
  
  // Convert JSON strings back to objects
  if (agent.capabilities) agent.capabilities = JSON.parse(agent.capabilities);
  if (agent.pricing) agent.pricing = JSON.parse(agent.pricing);

  console.log(`[agent] Registered new agent: ${name} (id: ${result.lastInsertRowid})`);
  res.status(201).json(agent);
});

// GET /api/agents — list all registered agents
app.get('/api/agents', (req, res) => {
  const agents = db.prepare('SELECT * FROM agents ORDER BY created_at DESC').all();
  
  // Convert JSON strings back to objects
  const parsed = agents.map(agent => {
    if (agent.capabilities) agent.capabilities = JSON.parse(agent.capabilities);
    if (agent.pricing) agent.pricing = JSON.parse(agent.pricing);
    return agent;
  });

  res.json(parsed);
});

// GET /api/agents/:id — get agent details by id
app.get('/api/agents/:id', (req, res) => {
  const { id } = req.params;
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(id);
  
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  // Convert JSON strings back to objects
  if (agent.capabilities) agent.capabilities = JSON.parse(agent.capabilities);
  if (agent.pricing) agent.pricing = JSON.parse(agent.pricing);

  res.json(agent);
});

// DELETE /api/agents/:id — delete an agent
app.delete('/api/agents/:id', (req, res) => {
  const { id } = req.params;
  
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(id);
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  const stmt = db.prepare('DELETE FROM agents WHERE id = ?');
  stmt.run(id);

  console.log(`[agent] Deleted agent: ${agent.name} (id: ${id})`);
  res.json({ status: 'ok', deleted: agent.name });
});

ENDROUTE
