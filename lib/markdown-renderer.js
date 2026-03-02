const fs = require('fs');
const path = require('path');

// Simple markdown to HTML converter (no external deps)
function markdownToHtml(markdown) {
  let html = markdown
    .replace(/^### (.*?)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*?)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*?)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n\n+/g, '</p><p>')
    .replace(/^/gm, '<p>')
    .replace(/$/gm, '</p>');
  return html;
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, content };
  
  const metaStr = match[1];
  const bodyContent = match[2];
  const meta = {};
  
  metaStr.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split(':');
    if (key && valueParts.length) {
      meta[key.trim()] = valueParts.join(':').trim().replace(/^"'|"'$/g, '');
    }
  });
  
  return { meta, content: bodyContent };
}

function loadBlogPost(slug) {
  const filePath = path.join(__dirname, '../public/blog', `${slug}.md`);
  if (!fs.existsSync(filePath)) return null;
  
  const rawContent = fs.readFileSync(filePath, 'utf8');
  const { meta, content } = parseFrontmatter(rawContent);
  const html = markdownToHtml(content);
  
  return {
    slug,
    title: meta.title || slug,
    description: meta.description || '',
    date: meta.date || new Date().toISOString().split('T')[0],
    content: html,
    meta
  };
}

function listBlogPosts() {
  const blogDir = path.join(__dirname, '../public/blog');
  if (!fs.existsSync(blogDir)) return [];
  
  return fs.readdirSync(blogDir)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace('.md', ''))
    .map(slug => loadBlogPost(slug))
    .filter(p => p !== null)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

module.exports = {
  markdownToHtml,
  parseFrontmatter,
  loadBlogPost,
  listBlogPosts
};
