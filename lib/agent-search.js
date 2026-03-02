const db = require('../db');

// Build search query with filters
function buildSearchQuery(q, filters) {
  let sql = 'SELECT id, name, description, category, pricing, uptime, rating, healthCheckUrl, capabilities, created_at FROM agents WHERE 1=1';
  let params = [];
  
  // Full-text search: name, description, capabilities
  if (q && q.trim()) {
    const searchTerm = '%' + q.toLowerCase() + '%';
    sql += ' AND (LOWER(name) LIKE ? OR LOWER(description) LIKE ? OR LOWER(capabilities) LIKE ?)';
    params.push(searchTerm, searchTerm, searchTerm);
  }
  
  // Filter by category
  if (filters.category && filters.category !== 'all') {
    sql += ' AND category = ?';
    params.push(filters.category);
  }
  
  // Filter by pricing
  if (filters.pricing && filters.pricing !== 'all') {
    sql += ' AND pricing = ?';
    params.push(filters.pricing);
  }
  
  // Filter by uptime threshold
  if (filters.minUptime) {
    sql += ' AND uptime >= ?';
    params.push(parseFloat(filters.minUptime));
  }
  
  // Filter by minimum rating
  if (filters.minRating) {
    sql += ' AND rating >= ?';
    params.push(parseFloat(filters.minRating));
  }
  
  // Sorting
  const sortMap = {
    'relevance': 'CASE WHEN LOWER(name) LIKE ? THEN 1 ELSE 2 END ASC, rating DESC',
    'rating': 'rating DESC',
    'uptime': 'uptime DESC',
    'newest': 'created_at DESC',
    'alphabetical': 'name ASC'
  };
  
  const sort = filters.sort || 'relevance';
  const sortClause = sortMap[sort] || sortMap.relevance;
  sql += ' ORDER BY ' + sortClause;
  
  // If sorting by relevance, add search term to params again
  if (sort === 'relevance' && q && q.trim()) {
    params.push('%' + q.toLowerCase() + '%');
  }
  
  // Pagination
  const limit = Math.min(parseInt(filters.limit) || 20, 100);
  const offset = Math.max(parseInt(filters.offset) || 0, 0);
  sql += ' LIMIT ? OFFSET ?';
  params.push(limit, offset);
  
  return { sql, params };
}

function search(q, filters = {}) {
  return new Promise((resolve, reject) => {
    try {
      const { sql, params } = buildSearchQuery(q, filters);
      // better-sqlite3 is synchronous - db.all() returns array directly
      const rows = db.all(sql, params);
      // Parse JSON fields
      const results = rows.map(r => ({
        ...r,
        capabilities: typeof r.capabilities === 'string' ? JSON.parse(r.capabilities) : r.capabilities
      }));
      resolve(results);
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { search, buildSearchQuery };
