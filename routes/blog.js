const express = require('express');
const router = express.Router();
const { loadBlogPost, listBlogPosts } = require('../lib/markdown-renderer');

// Blog index
router.get('/', (req, res) => {
  const posts = listBlogPosts();
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>AgentX Blog</title>
  <meta name="description" content="Latest articles about autonomous agents and AI infrastructure">
  <meta property="og:title" content="AgentX Blog">
  <meta property="og:description" content="Articles on agent infrastructure and deployment">
  <meta property="og:type" content="website">
  <style>
    body { font-family: -apple-system, sans-serif; max-width: 900px; margin: 0 auto; padding: 2rem; }
    a { color: #0066cc; }
    .post-item { border-bottom: 1px solid #eee; padding: 1rem 0; }
  </style>
</head>
<body>
  <h1>AgentX Blog</h1>
  ${posts.map(p => `
    <div class="post-item">
      <h2><a href="/blog/${p.slug}">${p.title}</a></h2>
      <p>${p.description}</p>
      <small>${p.date}</small>
    </div>
  `).join('')}
</body>
</html>
  `;
  res.set('Content-Type', 'text/html');
  res.send(html);
});

// Individual blog post
router.get('/:slug', (req, res) => {
  const post = loadBlogPost(req.params.slug);
  if (!post) {
    return res.status(404).json({ error: 'post_not_found' });
  }
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>${post.title} - AgentX</title>
  <meta name="description" content="${post.description}">
  <meta property="og:title" content="${post.title}">
  <meta property="og:description" content="${post.description}">
  <meta property="og:type" content="article">
  <meta property="article:published_time" content="${post.date}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${post.title}">
  <meta name="twitter:description" content="${post.description}">
  <style>
    body { font-family: -apple-system, sans-serif; max-width: 900px; margin: 0 auto; padding: 2rem; }
    a { color: #0066cc; }
    .post-meta { color: #666; margin-bottom: 2rem; }
  </style>
</head>
<body>
  <a href="/blog">← Back to blog</a>
  <div class="post-meta">${post.date}</div>
  <article>
    ${post.content}
  </article>
</body>
</html>
  `;
  res.set('Content-Type', 'text/html');
  res.send(html);
});

module.exports = router;
