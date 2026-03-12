const fs = require('fs');
const path = require('path');

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseListValue(value) {
  if (!value) return [];
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function normalizePostMeta(meta = {}) {
  const categories = parseListValue(meta.categories || meta.category);
  const keywords = parseListValue(meta.keywords);
  const relatedSlugs = parseListValue(meta.related_slugs);

  return {
    ...meta,
    categories,
    keywords,
    relatedSlugs,
    isBestOf: categories.includes('best-of'),
    readTime: meta.read_time || '8 min read',
    canonicalUrl: meta.canonical_url || (meta.slug ? `https://agentx.market/blog/${meta.slug}` : '')
  };
}

function isTableSeparator(line) {
  const cells = line.trim().split('|').map(cell => cell.trim()).filter(Boolean);
  return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell));
}

function parseTableRow(line) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map(cell => cell.trim());
}

function renderTable(tableLines) {
  if (tableLines.length < 2 || !isTableSeparator(tableLines[1])) return null;

  const headerCells = parseTableRow(tableLines[0]).map(cell => `<th>${cell}</th>`).join('');
  const bodyRows = tableLines
    .slice(2)
    .filter(line => line.trim())
    .map(line => {
      const cells = parseTableRow(line).map(cell => `<td>${cell}</td>`).join('');
      return `<tr>${cells}</tr>`;
    })
    .join('\n');

  return [
    '<div class="comparison-table-wrapper">',
    '<table class="comparison-table">',
    `<thead><tr>${headerCells}</tr></thead>`,
    `<tbody>${bodyRows}</tbody>`,
    '</table>',
    '</div>'
  ].join('\n');
}

// Markdown to HTML converter — handles headings, paragraphs, lists, links, code, blockquotes, images, hr
function markdownToHtml(markdown) {
  const lines = markdown.split('\n');
  const output = [];
  let inList = false;
  let listType = null; // 'ul' or 'ol'
  let inCodeBlock = false;
  let codeContent = '';
  let codeLang = '';

  function closeList() {
    if (inList) {
      output.push(`</${listType}>`);
      inList = false;
      listType = null;
    }
  }

  function inlineFormat(text) {
    return text
      // Images: ![alt](src)
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')
      // Links: [text](url)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      // Bold + italic: ***text***
      .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
      // Bold: **text**
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // Italic: *text*
      .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
      // Inline code: `code`
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Fenced code blocks
    if (line.match(/^```/)) {
      if (inCodeBlock) {
        output.push(`<pre><code>${codeContent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`);
        inCodeBlock = false;
        codeContent = '';
        codeLang = '';
      } else {
        closeList();
        inCodeBlock = true;
        codeLang = line.replace(/^```/, '').trim();
        codeContent = '';
      }
      continue;
    }
    if (inCodeBlock) {
      codeContent += (codeContent ? '\n' : '') + line;
      continue;
    }

    // Raw HTML blocks
    if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
      closeList();
      output.push(line);
      continue;
    }

    // Horizontal rule
    if (line.match(/^(-{3,}|\*{3,}|_{3,})\s*$/)) {
      closeList();
      output.push('<hr>');
      continue;
    }

    // Headings
    const h3Match = line.match(/^### (.+)/);
    if (h3Match) { closeList(); output.push(`<h3>${inlineFormat(h3Match[1])}</h3>`); continue; }
    const h2Match = line.match(/^## (.+)/);
    if (h2Match) { closeList(); output.push(`<h2>${inlineFormat(h2Match[1])}</h2>`); continue; }
    const h1Match = line.match(/^# (.+)/);
    if (h1Match) { closeList(); output.push(`<h1>${inlineFormat(h1Match[1])}</h1>`); continue; }

    // Blockquote
    const bqMatch = line.match(/^>\s?(.*)/);
    if (bqMatch) {
      closeList();
      output.push(`<blockquote><p>${inlineFormat(bqMatch[1])}</p></blockquote>`);
      continue;
    }

    // Markdown tables
    if (trimmed.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      closeList();
      const tableLines = [line, lines[i + 1]];
      i += 2;
      while (i < lines.length && lines[i].trim().includes('|')) {
        tableLines.push(lines[i]);
        i += 1;
      }
      i -= 1;
      const tableHtml = renderTable(tableLines.map(tableLine => inlineFormat(escapeHtml(tableLine))));
      if (tableHtml) {
        output.push(tableHtml);
        continue;
      }
    }

    // Unordered list
    const ulMatch = line.match(/^[-*]\s+(.+)/);
    if (ulMatch) {
      if (!inList || listType !== 'ul') {
        closeList();
        output.push('<ul>');
        inList = true;
        listType = 'ul';
      }
      output.push(`<li>${inlineFormat(ulMatch[1])}</li>`);
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^\d+\.\s+(.+)/);
    if (olMatch) {
      if (!inList || listType !== 'ol') {
        closeList();
        output.push('<ol>');
        inList = true;
        listType = 'ol';
      }
      output.push(`<li>${inlineFormat(olMatch[1])}</li>`);
      continue;
    }

    // Blank line — close list, skip
    if (line.trim() === '') {
      closeList();
      continue;
    }

    // Paragraph
    closeList();
    output.push(`<p>${inlineFormat(line.trim())}</p>`);
  }

  closeList();
  if (inCodeBlock) {
    output.push(`<pre><code>${codeContent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`);
  }

  return output.join('\n');
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, content };

  const metaStr = match[1];
  const bodyContent = match[2];
  const meta = {};

  metaStr.split('\n').forEach(line => {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');
      meta[key] = val;
    }
  });

  return { meta, content: bodyContent };
}

function loadBlogPost(slug) {
  const blogDir = path.join(__dirname, '../public/blog');
  const filePath = path.join(blogDir, `${slug}.md`);
  if (!fs.existsSync(filePath)) return null;

  const rawContent = fs.readFileSync(filePath, 'utf8');
  const { meta: rawMeta, content } = parseFrontmatter(rawContent);
  const meta = normalizePostMeta({ ...rawMeta, slug });
  const html = markdownToHtml(content);

  return {
    slug,
    title: meta.title || slug.replace(/-/g, ' '),
    description: meta.description || '',
    date: meta.date || '',
    author: meta.author || 'AgentX Team',
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
  normalizePostMeta,
  loadBlogPost,
  listBlogPosts
};
