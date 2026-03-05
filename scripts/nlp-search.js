// Natural language search utility with keyword extraction and fuzzy matching

// Simple keyword extractor - pulls meaningful words from natural language
function extractKeywords(query) {
  if (!query || typeof query !== 'string') return [];
  
  // Lowercase and normalize
  const normalized = query.toLowerCase().trim();
  
  // Remove common stop words
  const stopWords = new Set([
    'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', "you're", "you've", "you'll", "you'd",
    'your', 'yours', 'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she', "she's", 'her', 'hers',
    'herself', 'it', "it's", 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves', 'what', 'which',
    'who', 'whom', 'this', 'that', "that'll", 'these', 'those', 'am', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing', 'a', 'an', 'the', 'and', 'but', 'if',
    'or', 'because', 'as', 'until', 'while', 'of', 'at', 'by', 'for', 'with', 'about', 'against', 'between',
    'into', 'through', 'during', 'before', 'after', 'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out',
    'on', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why',
    'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
    'same', 'so', 'than', 'too', 'very', 'can', 'will', 'just', 'should', "now's", 'need', 'needs', 'able',
    'manage', 'schedule', 'organize', 'organise', 'handle', 'take care of', 'deal with', 'run', 'automate'
  ]);
  
  // Extract words, keeping compound phrases
  const phrases = [
    'email', 'email management', 'schedule meetings', 'meeting scheduler', 'calendar', 'calendar management',
    'task management', 'project management', 'data analysis', 'data processing', 'content creation',
    'social media', 'customer support', 'sales', 'marketing', 'lead generation', 'seo', 'search engine optimization',
    'code review', 'testing', 'qa', 'quality assurance', 'devops', 'monitoring', 'analytics'
  ];
  
  // Check for phrases first
  const foundPhrases = [];
  let searchQuery = normalized;
  
  phrases.forEach(phrase => {
    if (searchQuery.includes(phrase)) {
      foundPhrases.push(phrase);
      searchQuery = searchQuery.replace(phrase, '');
    }
  });
  
  // Extract remaining words
  const words = searchQuery
    .split(/[\s,;]+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
  
  // Combine phrases and words, remove duplicates
  const allKeywords = [...new Set([...foundPhrases, ...words])];
  
  return allKeywords;
}

// Fuzzy string matching with Levenshtein distance
function fuzzyMatch(text, keyword) {
  if (!text || !keyword) return 0;
  
  const lowerText = text.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();
  
  // Exact match
  if (lowerText.includes(lowerKeyword)) {
    return 1.0;
  }
  
  // Word boundary match
  const wordRegex = new RegExp('\\b' + lowerKeyword.split('').join('\\w*') + '\\w*', 'i');
  if (wordRegex.test(text)) {
    return 0.8;
  }
  
  // Levenshtein distance for close matches
  const distance = levenshtein(lowerKeyword, lowerText);
  const maxLength = Math.max(lowerKeyword.length, lowerText.length);
  const similarity = 1 - (distance / maxLength);
  
  return similarity > 0.5 ? similarity : 0;
}

// Levenshtein distance calculator
function levenshtein(a, b) {
  const matrix = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

// Rank agents by relevance
function rankAgentsByRelevance(agents, keywords) {
  return agents.map(agent => {
    let score = 0;
    const matches = [];
    
    // Check name
    if (agent.name) {
      keywords.forEach(keyword => {
        const match = fuzzyMatch(agent.name, keyword);
        if (match > 0) {
          score += match * 2; // Name matches are more important
          matches.push({ field: 'name', keyword, score: match });
        }
      });
    }
    
    // Check description
    if (agent.description) {
      keywords.forEach(keyword => {
        const match = fuzzyMatch(agent.description, keyword);
        if (match > 0) {
          score += match * 1.5; // Description matches are important
          matches.push({ field: 'description', keyword, score: match });
        }
      });
    }
    
    // Check categories
    if (agent.categories && agent.categories.length > 0) {
      agent.categories.forEach(category => {
        keywords.forEach(keyword => {
          const match = fuzzyMatch(category, keyword);
          if (match > 0) {
            score += match * 1.2; // Category matches are relevant
            matches.push({ field: 'category', keyword, score: match });
          }
        });
      });
    }
    
    // Check tags if available
    if (agent.tags && agent.tags.length > 0) {
      agent.tags.forEach(tag => {
        keywords.forEach(keyword => {
          const match = fuzzyMatch(tag, keyword);
          if (match > 0) {
            score += match * 1.0;
            matches.push({ field: 'tag', keyword, score: match });
          }
        });
      });
    }
    
    return {
      ...agent,
      relevanceScore: score,
      matches: matches
    };
  })
  .filter(agent => agent.relevanceScore > 0)
  .sort((a, b) => b.relevanceScore - a.relevanceScore);
}

// Main search function
function naturalLanguageSearch(agents, query) {
  if (!query || query.trim() === '') {
    return agents;
  }
  
  const keywords = extractKeywords(query);
  
  if (keywords.length === 0) {
    return agents;
  }
  
  return rankAgentsByRelevance(agents, keywords);
}

module.exports = {
  extractKeywords,
  fuzzyMatch,
  rankAgentsByRelevance,
  naturalLanguageSearch
};