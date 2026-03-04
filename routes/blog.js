const express = require('express');
const router = express.Router();
const { loadBlogPost, listBlogPosts } = require('../lib/markdown-renderer');

const NAV = `
  <nav class="navbar">
    <div class="container">
      <a href="/" class="nav-logo">
        <div class="logo-icon">X</div>
        AgentX
      </a>
      <ul class="nav-links">
        <li><a href="/features">Features</a></li>
        <li><a href="/pricing">Pricing</a></li>
        <li><a href="/about">About</a></li>
        <li><a href="/contact">Contact</a></li>
        <li class="nav-cta">
          <a href="/pricing" class="btn btn-primary">Get Started</a>
        </li>
      </ul>
      <button class="nav-toggle" aria-label="Menu">
        <span></span><span></span><span></span>
      </button>
    </div>
  </nav>`;

const FOOTER = `
  <footer class="footer">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          <a href="/" class="nav-logo" style="margin-bottom: 0.5rem;">
            <div class="logo-icon">X</div>
            AgentX
          </a>
          <p>The AI agent marketplace. Discover, deploy, and manage autonomous agents that handle real business tasks.</p>
        </div>
        <div class="footer-col">
          <h4>Product</h4>
          <ul>
            <li><a href="/features">Features</a></li>
            <li><a href="/pricing">Pricing</a></li>
            <li><a href="/browse">Browse Agents</a></li>
          </ul>
        </div>
        <div class="footer-col">
          <h4>Company</h4>
          <ul>
            <li><a href="/about">About</a></li>
            <li><a href="/blog">Blog</a></li>
            <li><a href="/contact">Contact</a></li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <span>&copy; 2026 AgentX Market. All rights reserved.</span>
      </div>
    </div>
  </footer>`;

function pageHead(title, description) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - AgentX</title>
  <meta name="description" content="${description}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <link rel="icon" type="image/svg+xml" href="/img/favicon.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/style.css">
  <style>
    .blog-content { max-width: 720px; margin: 0 auto; padding: var(--space-2xl) var(--space-lg); }
    .blog-content h1 { font-size: 2.5rem; margin-bottom: var(--space-md); }
    .blog-content h2 { font-size: 1.5rem; margin-top: var(--space-xl); margin-bottom: var(--space-md); color: var(--text-primary); }
    .blog-content p { font-size: 1.1rem; line-height: 1.8; margin-bottom: var(--space-md); color: var(--text-secondary); }
    .blog-content ul, .blog-content ol { margin-bottom: var(--space-md); padding-left: var(--space-lg); }
    .blog-content li { font-size: 1.1rem; line-height: 1.8; margin-bottom: var(--space-sm); color: var(--text-secondary); }
    .blog-content strong { color: var(--text-primary); }
    .blog-content em { color: var(--text-tertiary); }
    .blog-content hr { border: none; border-top: 1px solid var(--border); margin: var(--space-xl) 0; }
    .blog-meta { color: var(--text-tertiary); font-size: 0.9rem; margin-bottom: var(--space-xl); }
    .blog-back { display: inline-block; margin-bottom: var(--space-lg); color: var(--accent); text-decoration: none; font-size: 0.9rem; }
    .blog-back:hover { text-decoration: underline; }
    .blog-list-item { border-bottom: 1px solid var(--border); padding: var(--space-lg) 0; }
    .blog-list-item h2 { margin: 0 0 var(--space-sm) 0; font-size: 1.4rem; }
    .blog-list-item h2 a { color: var(--text-primary); text-decoration: none; }
    .blog-list-item h2 a:hover { color: var(--accent); }
    .blog-list-item p { color: var(--text-secondary); margin: 0 0 var(--space-xs) 0; }
    .blog-list-item small { color: var(--text-tertiary); }
  </style>
</head>`;
}

// Blog index
router.get('/', (req, res) => {
  const posts = listBlogPosts();
  res.render('blog-index', { posts });
});

// Individual blog post
router.get('/:slug', (req, res) => {
  const post = loadBlogPost(req.params.slug);
  if (!post) {
    return res.status(404).json({ error: 'post_not_found' });
  }

  const html = `${pageHead(post.title, post.description)}
  <meta property="og:type" content="article">
  <meta property="article:published_time" content="${post.date}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${post.title}">
  <meta name="twitter:description" content="${post.description}">
<body class="noise-overlay">
  ${NAV}
  <div class="blog-content">
    <a href="/blog" class="blog-back">&larr; Back to blog</a>
    <div class="blog-meta">${post.date}</div>
    <article>
      ${post.content}
    </article>
  </div>
  ${FOOTER}
  <script src="/js/main.js"></script>
</body>
</html>`;
  res.set('Content-Type', 'text/html');
  res.send(html);
});

module.exports = router;
