const express = require('express');
const db = require('../db');
const router = express.Router();

// SEO Category Landing Pages
// Targets searches like 'AI coding agent', 'AI research agent'
router.get('/agents/:categorySlug', async (req, res) => {
  const { categorySlug } = req.params;

  try {
    // Fetch category
    const category = await db.get(
      'SELECT * FROM categories WHERE slug = ?',
      [categorySlug]
    );

    if (!category) {
      return res.status(404).render('agent-not-found', { slug: categorySlug });
    }

    // Fetch agents in this category with their capabilities
    const agents = await db.all(
      `SELECT a.*, 
       GROUP_CONCAT(ac.name, ', ') as capabilities,
       c2.name as categoryName,
       c2.slug as categorySlug
       FROM agents a
       JOIN agent_categories ac ON a.id = ac.agent_id
       JOIN categories c2 ON ac.category_id = c2.id
       WHERE c2.slug = ? AND a.status = 'approved'
       GROUP BY a.id
       ORDER BY a.created_at DESC`,
      [categorySlug]
    );

    // Fetch related categories for internal linking
    const relatedCategories = await db.all(
      `SELECT c.*, COUNT(ac.agent_id) as agent_count 
       FROM categories c
       LEFT JOIN agent_categories ac ON c.id = ac.category_id
       WHERE c.slug != ? AND a.status = 'approved'
       GROUP BY c.id
       ORDER BY agent_count DESC
       LIMIT 5`,
      [categorySlug]
    );

    // Build schema markup for rich snippets
    const schemaMarkup = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "name": `${category.name} Agents - AI Agent Directory`,
      "description": category.description,
      "url": `https://agentx.market/agents/${categorySlug}`,
      "mainEntity": {
        "@type": "ItemList",
        "itemListElement": agents.map((agent, index) => ({
          "@type": "ListItem",
          "position": index + 1,
          "url": `https://agentx.market/agents/${agent.slug}`,
          "name": agent.name
        }))
      }
    };

    res.render('category-landing', {
      category,
      agents,
      relatedCategories,
      schemaJson: JSON.stringify(schemaMarkup),
      pageTitle: `${category.name} Agents | AI Agent Directory`,
      pageDescription: `Discover top ${category.name.toLowerCase()} AI agents on AgentX. ${category.description} Find the perfect agent for your needs.`
    });

  } catch (err) {
    console.error(`[category-landing] Error loading ${categorySlug}:`, err.message);
    res.status(500).render('error', { message: 'Failed to load category page' });
  }
});

module.exports = router;
