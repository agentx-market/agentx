const express = require('express');
const router = express.Router();
const { loadBlogPost, listBlogPosts } = require('../lib/markdown-renderer');
const { buildSeasonalHub, listSeasonalHubEntries } = require('../lib/seasonal-content');

function getAllPosts() {
  return [...listSeasonalHubEntries(), ...listBlogPosts()];
}

// Blog index — uses EJS template
router.get('/', (req, res) => {
  const category = req.query.category || '';
  const posts = getAllPosts().filter(post => {
    if (!category) return true;
    return Array.isArray(post.meta?.categories) && post.meta.categories.includes(category);
  });

  res.render('blog-index', {
    posts,
    selectedCategory: category,
    categories: [
      { label: 'All Posts', value: '' },
      { label: 'Best Of', value: 'best-of' }
    ]
  });
});

router.get('/best-ai-agents-:year/:monthSlug', (req, res) => {
  const page = buildSeasonalHub(req.params.year, req.params.monthSlug, req.query.preview === '1');
  if (!page) {
    return res.status(404).render('blog-index', { posts: getAllPosts(), selectedCategory: '', categories: [{ label: 'All Posts', value: '' }, { label: 'Best Of', value: 'best-of' }] });
  }
  res.render('blog-seasonal-hub', { page });
});

router.get('/best-ai-agents-:year', (req, res) => {
  const page = buildSeasonalHub(req.params.year, null, req.query.preview === '1');
  if (!page) {
    return res.status(404).render('blog-index', { posts: getAllPosts(), selectedCategory: '', categories: [{ label: 'All Posts', value: '' }, { label: 'Best Of', value: 'best-of' }] });
  }
  res.render('blog-seasonal-hub', { page });
});

// Individual blog post — uses EJS template
router.get('/:slug', (req, res) => {
  const post = loadBlogPost(req.params.slug);
  if (!post) {
    return res.status(404).render('blog-index', { posts: getAllPosts(), selectedCategory: '', categories: [{ label: 'All Posts', value: '' }, { label: 'Best Of', value: 'best-of' }] });
  }

  const relatedPosts = listBlogPosts()
    .filter(candidate => candidate.slug !== post.slug)
    .map(candidate => {
      let score = 0;
      if (post.meta.relatedSlugs?.includes(candidate.slug)) score += 3;
      if (post.meta.categories?.some(category => candidate.meta.categories?.includes(category))) score += 2;
      if (post.meta.keywords?.some(keyword => candidate.meta.keywords?.includes(keyword))) score += 1;
      return { candidate, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || new Date(b.candidate.date) - new Date(a.candidate.date))
    .slice(0, 3)
    .map(item => item.candidate);

  res.render('blog-post', { post, relatedPosts });
});

module.exports = router;
