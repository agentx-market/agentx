const db = require('../db');

function buildSearchQuery(q, filters) {
  // agents table: id, operator_id, name, description, capabilities, endpoint_url,
  // pricing, status, health_check_passed_at, created_at, updated_at, health_endpoint_url, apiKeyHash
  // Categories: agent_categories (agent_id, category_id) → categories (id, name, slug)

  let sql = `SELECT DISTINCT a.id, a.name, a.description, a.capabilities,
    a.endpoint_url, a.pricing, a.status, a.health_endpoint_url,
    a.health_check_passed_at, a.created_at`;
  let params = [];
  let needsCategoryJoin = filters.category && filters.category !== 'all';

  if (needsCategoryJoin) {
    sql += ', c.name AS category_name, c.slug AS category_slug';
  }

  sql += ' FROM agents a';

  if (needsCategoryJoin) {
    sql += ' JOIN agent_categories ac ON ac.agent_id = a.id';
    sql += ' JOIN categories c ON c.id = ac.category_id';
  }

  sql += ' WHERE 1=1';

  // Full-text search on name, description, capabilities
  if (q && q.trim()) {
    const searchTerm = '%' + q.toLowerCase() + '%';
    sql += ' AND (LOWER(a.name) LIKE ? OR LOWER(a.description) LIKE ? OR LOWER(a.capabilities) LIKE ?)';
    params.push(searchTerm, searchTerm, searchTerm);
  }

  // Filter by category slug or name
  if (needsCategoryJoin) {
    sql += ' AND (c.slug = ? OR c.name = ?)';
    params.push(filters.category, filters.category);
  }

  // Sorting
  const sortMap = {
    'relevance': 'a.name ASC',
    'newest': 'a.created_at DESC',
    'alphabetical': 'a.name ASC'
  };
  sql += ' ORDER BY ' + (sortMap[filters.sort] || sortMap.relevance);

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
      const rows = db.all(sql, params);
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
