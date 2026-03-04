const Database = require('better-sqlite3');
const path = require('path');

// Database path
const dbPath = path.join(__dirname, 'agentx.db');
const db = new Database(dbPath);

console.log('Starting category assignment for seeded agents...');

// Define the category assignments for each agent
const categoryAssignments = [
  {
    name: 'Marco (Revenue Ops)',
    categories: ['Payments', 'Productivity']
  },
  {
    name: 'Deep (QA & Testing)',
    categories: ['Monitoring', 'Productivity']
  },
  {
    name: 'Research (Competitor Intel)',
    categories: ['Data', 'Productivity']
  },
  {
    name: 'Security (Audit & Compliance)',
    categories: ['Security', 'Monitoring']
  },
  {
    name: 'Marketing (Content & Leads)',
    categories: ['Productivity', 'Data']
  },
  {
    name: 'Coding (Development)',
    categories: ['Productivity', 'Data']
  }
];

// Process each assignment
for (const assignment of categoryAssignments) {
  const agent = db.prepare('SELECT id FROM agents WHERE name = ?').get(assignment.name);
  
  if (agent) {
    console.log(`Found agent: ${assignment.name} (ID: ${agent.id})`);
    
    for (const categoryName of assignment.categories) {
      const category = db.prepare('SELECT id FROM categories WHERE name = ?').get(categoryName);
      
      if (category) {
        // Check if this assignment already exists
        const existing = db.prepare('SELECT COUNT(*) as count FROM agent_categories WHERE agent_id = ? AND category_id = ?').get(agent.id, category.id);
        
        if (existing.count === 0) {
          db.prepare('INSERT INTO agent_categories (agent_id, category_id) VALUES (?, ?)').run(agent.id, category.id);
          console.log(`  Assigned category: ${categoryName}`);
        } else {
          console.log(`  Category ${categoryName} already assigned`);
        }
      } else {
        console.log(`  Warning: Category ${categoryName} not found`);
      }
    }
  } else {
    console.log(`Warning: Agent ${assignment.name} not found`);
  }
}

console.log('Category assignment complete!');
