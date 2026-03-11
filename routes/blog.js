const express = require('express');
const router = express.Router();
const { loadBlogPost, listBlogPosts } = require('../lib/markdown-renderer');
const { buildSeasonalHub, listSeasonalHubEntries } = require('../lib/seasonal-content');

// Blog index — uses EJS template
router.get('/', (req, res) => {
  const posts = [...listSeasonalHubEntries(), ...listBlogPosts()];
  res.render('blog-index', { posts });
});

router.get('/best-ai-agents-:year/:monthSlug', (req, res) => {
  const page = buildSeasonalHub(req.params.year, req.params.monthSlug, req.query.preview === '1');
  if (!page) {
    return res.status(404).render('blog-index', { posts: [...listSeasonalHubEntries(), ...listBlogPosts()] });
  }
  res.render('blog-seasonal-hub', { page });
});

router.get('/best-ai-agents-:year', (req, res) => {
  const page = buildSeasonalHub(req.params.year, null, req.query.preview === '1');
  if (!page) {
    return res.status(404).render('blog-index', { posts: [...listSeasonalHubEntries(), ...listBlogPosts()] });
  }
  res.render('blog-seasonal-hub', { page });
});

// Individual blog post — uses EJS template
router.get('/:slug', (req, res) => {
  const post = loadBlogPost(req.params.slug);
  if (!post) {
    return res.status(404).render('blog-index', { posts: [...listSeasonalHubEntries(), ...listBlogPosts()] });
  }
  res.render('blog-post', { post });
});

module.exports = router;
