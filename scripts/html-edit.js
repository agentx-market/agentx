#!/usr/bin/env node
// html-edit.js — CSS-selector-based HTML editing via cheerio
// Usage: node scripts/html-edit.js <file> <selector> <action> [value]
//
// Actions:
//   replace-inner  — Replace innerHTML of matched element
//   replace-outer  — Replace entire element
//   set-attr       — Set attribute (value = "attr=val")
//   append-child   — Append HTML inside matched element
//   prepend-child  — Prepend HTML inside matched element
//   remove         — Remove matched element(s)
//   get-text       — Print text content (read-only)
//   get-html       — Print innerHTML (read-only)
//
// Output: JSON { success: bool, matched: int, file: string }

const fs = require('fs');
const cheerio = require('cheerio');

function output(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
  process.exit(obj.success === false ? 1 : 0);
}

const args = process.argv.slice(2);

if (args.length < 3) {
  output({
    success: false,
    error: 'Usage: node scripts/html-edit.js <file> <selector> <action> [value]',
    actions: [
      'replace-inner', 'replace-outer', 'set-attr',
      'append-child', 'prepend-child', 'remove',
      'get-text', 'get-html'
    ]
  });
}

const [file, selector, action, ...valueParts] = args;
const value = valueParts.join(' ');

// Validate file exists
if (!fs.existsSync(file)) {
  output({ success: false, error: `File not found: ${file}` });
}

// Read and parse
let html;
try {
  html = fs.readFileSync(file, 'utf-8');
} catch (e) {
  output({ success: false, error: `Cannot read file: ${e.message}` });
}

const $ = cheerio.load(html, { decodeEntities: false });
const matched = $(selector);
const count = matched.length;

if (count === 0) {
  output({ success: false, error: `No elements matched selector: ${selector}`, matched: 0, file });
}

// Read-only actions
if (action === 'get-text') {
  const texts = [];
  matched.each((i, el) => texts.push($(el).text()));
  output({ success: true, matched: count, file, result: texts.length === 1 ? texts[0] : texts });
}

if (action === 'get-html') {
  const htmls = [];
  matched.each((i, el) => htmls.push($(el).html()));
  output({ success: true, matched: count, file, result: htmls.length === 1 ? htmls[0] : htmls });
}

// Write actions — require value (except remove)
if (action !== 'remove' && !value) {
  output({ success: false, error: `Action "${action}" requires a value argument` });
}

switch (action) {
  case 'replace-inner':
    matched.html(value);
    break;
  case 'replace-outer':
    matched.replaceWith(value);
    break;
  case 'set-attr': {
    const eqIdx = value.indexOf('=');
    if (eqIdx === -1) {
      output({ success: false, error: 'set-attr value must be "attr=val" (e.g., "class=hero-title")' });
    }
    const attrName = value.slice(0, eqIdx);
    const attrVal = value.slice(eqIdx + 1);
    matched.attr(attrName, attrVal);
    break;
  }
  case 'append-child':
    matched.append(value);
    break;
  case 'prepend-child':
    matched.prepend(value);
    break;
  case 'remove':
    matched.remove();
    break;
  default:
    output({ success: false, error: `Unknown action: ${action}. Valid: replace-inner, replace-outer, set-attr, append-child, prepend-child, remove, get-text, get-html` });
}

// Write back
try {
  fs.writeFileSync(file, $.html());
  output({ success: true, matched: count, file, action });
} catch (e) {
  output({ success: false, error: `Cannot write file: ${e.message}` });
}
