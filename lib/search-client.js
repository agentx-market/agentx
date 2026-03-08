const algoliasearch = require('algoliasearch');
const db = require('../db');

// Initialize Algolia client from environment variables
const ALGOLIA_APP_ID = process.env.ALGOLIA_APP_ID;
const ALGOLIA_ADMIN_KEY = process.env.ALGOLIA_ADMIN_KEY;
const ALGOLIA_SEARCH_KEY = process.env.ALGOLIA_SEARCH_KEY;
const ALGOLIA_INDEX_NAME = process.env.ALGOLIA_INDEX_NAME || 'agents';

if (!ALGOLIA_APP_ID || !ALGOLIA_ADMIN_KEY) {
  console.error('WARNING: Algolia credentials not configured. Search will use SQLite fallback.');
}

// Initialize client with typo tolerance and custom ranking rules
const client = ALGOLIA_APP_ID && ALGOLIA_ADMIN_KEY 
  ? algoliasearch(ALGOLIA_APP_ID, ALGOLIA_ADMIN_KEY)
  : null;

const index = client ? client.initIndex(ALGOLIA_INDEX_NAME) : null;

// Configure custom ranking rules
let settings = {
  attributesToSnippet: ['description:30'],
  snippetEllipsisText: '...',
  searchableAttributes: [
    'name',
    'description', 
    'capabilities',
    'provider'
  ],
  attributesForFaceting: [
    'filterOnly(category)',
    'filterOnly(pricing)',
    'filterOnly(status)'
  ],
  customRankingDesc: ['desc(responseTimeMs)'],
  ranking: [
    'typo',
    'geo',
    'words',
    'filters',
    'proximity',
    'attribute',
    'exact',
    'custom'
  ],
  minWordSizefor1Typo: 3,
  minWordSizefor2Typos: 7,
  allowTyposOnNumericTokens: true,
  advancedSyntax: true,
  removeWordsIfNoResults: 'lastWords',
  queryType: 'prefixLast',
  maxValuesPerFacet: 100
};

// Sync agents from SQLite to Algolia index
async function syncIndex() {
  if (!client || !index) {
    console.error('[search] Cannot sync: Algolia not configured');
    return { success: false, error: 'Algolia not configured' };
  }

  try {
    const agents = db.prepare('SELECT * FROM agents').all();
    
    // Transform agents to Algolia-compatible format
    const objects = agents.map(agent => ({
      objectID: agent.id,
      name: agent.name,
      description: agent.description,
      capabilities: typeof agent.capabilities === 'string' 
        ? JSON.parse(agent.capabilities) 
        : (agent.capabilities || []),
      endpoint_url: agent.endpoint_url,
      pricing: agent.pricing,
      status: agent.status,
      provider: extractProviderFromUrl(agent.endpoint_url),
      category: getCategoryForAgent(agent.id),
      responseTimeMs: agent.response_time_ms || 0,
      createdAt: agent.created_at,
      updatedAt: agent.updated_at
    }));

    // Push to Algolia
    const result = await index.saveObjects(objects);
    
    console.log(`[search] Synced ${objects.length} agents to Algolia (objectIDs: ${result.objectIDs?.length || 0})`);
    
    return { 
      success: true, 
      synced: objects.length,
      objectIds: result.objectIDs
    };
  } catch (error) {
    console.error('[search] Sync failed:', error.message);
    return { success: false, error: error.message };
  }
}

// Search with typo tolerance and custom ranking
async function searchAlgolia(query, filters = {}) {
  if (!client || !index) {
    // Fallback to SQLite
    console.log('[search] No Algolia index, using SQLite fallback');
    const { search: sqliteSearch } = require('./agent-search');
    return await sqliteSearch(query, filters);
  }

  try {
    // Build Algolia filters from query params
    let algoliaFilters = '';
    if (filters.category && filters.category !== 'all') {
      algoliaFilters += `category:"${filters.category}"`;
    }
    if (filters.pricing && filters.pricing !== 'all') {
      algoliaFilters += (algoliaFilters ? ' AND ' : '') + `pricing:"${filters.pricing}"`;
    }
    if (filters.status) {
      algoliaFilters += (algoliaFilters ? ' AND ' : '') + `status:"${filters.status}"`;
    }

    const params = {
      query: query,
      filters: algoliaFilters,
      facets: ['category', 'pricing', 'status'],
      attributesToRetrieve: ['name', 'description', 'capabilities', 'endpoint_url', 'pricing', 'status'],
      highlightPreTag: '<mark>',
      highlightPostTag: '</mark>',
      maxFacetValues: 100
    };

    const { hits, nbHits, processingTimeMS } = await index.search(params);

    // Log search to analytics table
    await logSearchAnalytics({
      query,
      filters,
      resultsCount: nbHits,
      responseTimeMs: processingTimeMS
    });

    return {
      results: hits.map(hit => ({
        objectID: hit.objectID,
        name: hit.name,
        description: hit.description,
        capabilities: hit.capabilities,
        endpoint_url: hit.endpoint_url,
        pricing: hit.pricing,
        status: hit.status,
        category: hit.category,
        provider: hit.provider
      })),
      totalHits: nbHits,
      processingTimeMs: processingTimeMS,
      hasAlgoliaFallback: false
    };
  } catch (error) {
    console.error('[search] Algolia search failed:', error.message);
    // Fallback to SQLite
    const { search: sqliteSearch } = require('./agent-search');
    return await sqliteSearch(query, filters);
  }
}

// Helper functions
function extractProviderFromUrl(url) {
  if (!url) return 'unknown';
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace('www.', '');
  } catch (e) {
    return 'unknown';
  }
}

function getCategoryForAgent(agentId) {
  try {
    const categories = db.prepare(`
      SELECT c.name, c.slug 
      FROM categories c 
      JOIN agent_categories ac ON ac.category_id = c.id 
      WHERE ac.agent_id = ?
    `).all(agentId);
    return categories.length > 0 ? categories[0].slug : 'general';
  } catch (e) {
    return 'general';
  }
}

// Analytics logging
async function logSearchAnalytics(data) {
  try {
    db.prepare(`
      INSERT INTO search_analytics (query, filters, results_count, response_time_ms, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      data.query || '',
      JSON.stringify(data.filters || {}),
      data.resultsCount || 0,
      data.responseTimeMs || 0,
      Date.now()
    );
  } catch (e) {
    console.error('[search] Failed to log analytics:', e.message);
  }
}

// Get admin dashboard data
async function getSearchAnalytics(options = {}) {
  const { days = 7, queryId = null, topQueriesLimit = 10 } = options;
  
  try {
    if (queryId) {
      return db.prepare(`
        SELECT * FROM search_analytics WHERE id = ?
      `).get(queryId);
    }

    const ago = Date.now() - (days * 24 * 60 * 60 * 1000);
    
    // Get top queries
    const topQueries = db.prepare(`
      SELECT query, COUNT(*) as count, AVG(response_time_ms) as avg_time, SUM(results_count) as total_results
      FROM search_analytics 
      WHERE created_at > ? AND query != ''
      GROUP BY query
      ORDER BY count DESC
      LIMIT ?
    `).all(ago, topQueriesLimit);

    // Get zero-result searches
    const zeroResultSearches = db.prepare(`
      SELECT COUNT(*) as count, query, created_at
      FROM search_analytics 
      WHERE created_at > ? AND results_count = 0
      GROUP BY query
      ORDER BY count DESC
      LIMIT 10
    `).all(ago);

    // Get daily stats for chart
    const dailyStats = db.prepare(`
      SELECT 
        DATE(created_at, 'unixepoch', 'localtime') as date,
        COUNT(*) as search_count,
        AVG(response_time_ms) as avg_response_time,
        SUM(CASE WHEN results_count = 0 THEN 1 ELSE 0 END) as zero_result_count
      FROM search_analytics 
      WHERE created_at > ?
      GROUP BY DATE(created_at, 'unixepoch', 'localtime')
      ORDER BY date ASC
    `).all(ago);

    // Get avg response time over period
    const avgResponseTime = db.prepare(`
      SELECT AVG(response_time_ms) as avg_time
      FROM search_analytics 
      WHERE created_at > ?
    `).get(ago);

    return {
      topQueries,
      zeroResultSearches,
      dailyStats,
      avgResponseTime: avgResponseTime?.avg_time || 0,
      totalSearches: db.prepare(`SELECT COUNT(*) as count FROM search_analytics WHERE created_at > ?`).get(ago)?.count || 0
    };
  } catch (e) {
    console.error('[search] Analytics query failed:', e.message);
    return null;
  }
}

module.exports = {
  client,
  index,
  settings,
  syncIndex,
  searchAlgolia,
  getSearchAnalytics,
  logSearchAnalytics,
  ALGOLIA_INDEX_NAME
};
