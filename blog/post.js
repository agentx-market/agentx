const fs = require('fs');
const path = require('path');

// Parse Frontmatter and render post
function parseMarkdownWithFrontmatter(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Extract frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!frontmatterMatch) return null;

  const [, frontmatter, body] = frontmatterMatch;

  // Parse YAML frontmatter (simple parser for our needs)
  const metadata = {};
  frontmatter.trim().split('\n').forEach(line => {
    const [key, ...valueParts] = line.split(':');
    if (key && valueParts.length > 0) {
      let value = valueParts.join(':').trim();
      // Remove quotes if present
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      metadata[key.trim()] = value;
    }
  });

  return {
    metadata,
    content: body.trim()
  };
}

function renderFAQSchema(faqItems) {
  if (!faqItems || faqItems.length === 0) return '';

  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqItems.map(item => ({
      "@type": "Question",
      "name": item.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": item.answer.replace(/\n/g, ' ').trim()
      }
    }))
  };

  return `<script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n</script>`;
}

function renderFAQHTML(faqItems) {
  if (!faqItems || faqItems.length === 0) return '';

  let html = '<ul class="faq-list">';
  faqItems.forEach(item => {
    html += `
      <li class="faq-item">
        <h3 class="faq-question">${item.question}</h3>
        <div class="faq-answer">${item.answer.replace(/\n/g, '<br>')}</div>
      </li>`;
  });
  html += '</ul>';

  return html;
}

function renderBlogPost(filePath, outputHtmlPath) {
  const parsed = parseMarkdownWithFrontmatter(filePath);
  if (!parsed) throw new Error(`Invalid markdown file: ${filePath}`);

  const { metadata, content } = parsed;

  // Generate FAQ schema and HTML
  const faqSchema = renderFAQSchema(metadata.faq_items || []);
  const faqHTML = renderFAQHTML(metadata.faq_items || []);

  // Read template
  let template = fs.readFileSync(path.join(__dirname, 'post-template.html'), 'utf8');

  // Replace placeholders
  const processedContent = content
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^# /gm, '<h2>')
    .replace(/^(## )/gm, '</h2><h3>')
    .replace(/^### /gm, '</h3><h4>')
    .replace(/^\* /gm, '<ul><li>')
    .replace(/^\-/gm, '<ul><li>')
    .replace(/\*\//g, '</li></ul>')
    .replace(/\/\*/g, '</ul><p>');

  template = template
    .replace('{{{ title }}}', metadata.title || 'Untitled')
    .replace('{{{ slug }}}', metadata.slug || 'unknown')
    .replace('{{{ description }}}', metadata.description || '')
    .replace('{{{ featured_image }}}', metadata.featured_image || '/images/blog-default.jpg')
    .replace('{{{ published_date }}}', metadata.published_date || new Date().toISOString())
    .replace('{{{ created_at }}}', metadata.created_at || new Date().toISOString())
    .replace('{{{ date }}}', new Date(metadata.published_date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }))
    .replace('{{{ read_time }}}', metadata.read_time || '5 min read')
    .replace('{{{ FAQ_SCHEMA }}}', faqSchema)
    .replace('{{{ CONTENT }}}', processedContent)
    .replace('{{{ FAQ_HTML }}}', faqHTML)
    .replace('{{#faq_schema}}', metadata.faq_items && metadata.faq_items.length > 0 ? '' : '<!--')
    .replace('{{/faq_schema}}', metadata.faq_items && metadata.faq_items.length > 0 ? '' : '-->')
    .replace('{NAV_BACK}', '<a href="/blog" class="back-link">← Back to Blog</a>')
    .replace('{FEATURED_IMAGE_HTML}', metadata.featured_image ? 
      `<div class="featured-image"><img src="${metadata.featured_image}" alt="${metadata.title}"></div>` : '');

  fs.writeFileSync(outputHtmlPath, template);
  console.log(`✅ Generated: ${outputHtmlPath}`);
}

// Run for all markdown files in blog directory
const blogDir = __dirname;
const mdFiles = fs.readdirSync(blogDir).filter(f => f.endsWith('.md'));

mdFiles.forEach(file => {
  const outputPath = path.join(
    blogDir, 
    file.replace('.md', '.html')
  );
  
  try {
    renderBlogPost(path.join(blogDir, file), outputPath);
  } catch (error) {
    console.error(`❌ Failed ${file}:`, error.message);
  }
});

console.log('\n✅ All blog posts rendered!');
