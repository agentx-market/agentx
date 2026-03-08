const express = require('express');
const router = express.Router();
const { loadBlogPost, listBlogPosts } = require('../lib/markdown-renderer');

// Blog index — uses EJS template
router.get('/', (req, res) => {
  const posts = listBlogPosts();
  res.render('blog-index', { posts });
});

// Individual blog post — uses EJS template
router.get('/:slug', (req, res) => {
  const post = loadBlogPost(req.params.slug);
  if (!post) {
    return res.status(404).render('blog-index', { posts: listBlogPosts() });
  }
  res.render('blog-post', { post });
});

module.exports = router;
