#!/usr/bin/env node
/**
 * Post to Reddit via Playwright Firefox browser automation.
 * No API keys needed — uses username/password login.
 *
 * Usage:
 *   node ~/marco_web/scripts/reddit_browser_post.js \
 *     --subreddit SideProject \
 *     --title "My post title" \
 *     --body-file ~/marco_web/outreach/reddit-sideproject.txt
 *
 * Credentials: ~/.config/reddit/credentials.json
 *   { "username": "marcoagent42", "password": "..." }
 */

const { firefox } = require('playwright');
const fs = require('fs');
const path = require('path');

const STATE_DIR = path.join(process.env.HOME, '.config/reddit/browser-state');
const STATE_FILE = path.join(STATE_DIR, 'firefox-state.json');

async function login(page, creds) {
  console.log('Logging in to Reddit...');
  await page.goto('https://www.reddit.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  // Tab 7 = username, Tab 8 = password (verified by screenshot probing)
  for (let i = 0; i < 7; i++) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);
  }
  await page.keyboard.type(creds.username, { delay: 40 });
  await page.waitForTimeout(500);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  await page.keyboard.type(creds.password, { delay: 40 });
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(8000);

  if (page.url().includes('/login')) {
    await page.screenshot({ path: '/tmp/reddit-login-fail.png' });
    throw new Error('Login failed — still on login page. Screenshot: /tmp/reddit-login-fail.png');
  }
  console.log('Login successful');
}

async function postToSubreddit(page, context, subreddit, title, body) {
  // Use old.reddit.com for posting — simpler, more reliable DOM
  const submitUrl = `https://old.reddit.com/r/${subreddit}/submit?selftext=true`;
  console.log(`Navigating to ${submitUrl}`);
  await page.goto(submitUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Check if old.reddit.com needs login (redirects to login page)
  if (page.url().includes('/login')) {
    console.log('old.reddit.com needs login, will use new reddit submit instead');
    // Fall back to new Reddit
    const newSubmitUrl = `https://www.reddit.com/r/${subreddit}/submit?type=TEXT`;
    await page.goto(newSubmitUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: '/tmp/reddit-submit-page.png' });
    return await postNewReddit(page, title, body);
  }

  await page.screenshot({ path: '/tmp/reddit-submit-page.png' });

  // Old Reddit submit form: title textarea and text textarea
  const titleField = await page.$('textarea[name="title"], input[name="title"]');
  const textTab = await page.$('.text-button, li.text a, a[href*="selftext=true"]');

  if (!titleField) {
    console.log('Old Reddit form not found, trying new Reddit...');
    const newSubmitUrl = `https://www.reddit.com/r/${subreddit}/submit?type=TEXT`;
    await page.goto(newSubmitUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
    return await postNewReddit(page, title, body);
  }

  // Click text tab if it exists
  if (textTab) {
    await textTab.click();
    await page.waitForTimeout(1000);
  }

  await titleField.fill(title);
  await page.waitForTimeout(500);

  const textField = await page.$('textarea[name="text"]');
  if (!textField) {
    throw new Error('Could not find text body field on old Reddit');
  }
  await textField.fill(body);
  await page.waitForTimeout(500);

  await page.screenshot({ path: '/tmp/reddit-pre-submit.png', fullPage: true });
  console.log('Pre-submit screenshot: /tmp/reddit-pre-submit.png');

  // Click submit
  const submitBtn = await page.$('button[type="submit"][name="submit"]');
  if (submitBtn) {
    await submitBtn.click();
  } else {
    // Try any submit button
    const anySubmit = await page.$('button[type="submit"]');
    if (anySubmit) await anySubmit.click();
    else throw new Error('No submit button found');
  }

  await page.waitForTimeout(8000);
  return page.url();
}

async function postNewReddit(page, title, body) {
  await page.screenshot({ path: '/tmp/reddit-new-submit.png' });

  // New Reddit: Tab through to find title and body fields
  // This is fragile but works with the current Reddit layout
  // Try to find textareas
  const textareas = await page.$$('textarea');
  console.log(`Found ${textareas.length} textareas`);

  if (textareas.length >= 2) {
    await textareas[0].fill(title);
    await page.waitForTimeout(500);
    await textareas[1].fill(body);
  } else if (textareas.length === 1) {
    // Might be title only, body might be contenteditable
    await textareas[0].fill(title);
    await page.waitForTimeout(500);
    // Try Tab to body
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);
    await page.keyboard.type(body, { delay: 5 });
  } else {
    throw new Error('No textareas found on submit page');
  }

  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/reddit-pre-submit.png', fullPage: true });

  // Find Post button
  const postBtn = await page.$('button:has-text("Post")');
  if (postBtn) {
    await postBtn.click();
  } else {
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
  }

  await page.waitForTimeout(8000);
  return page.url();
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (name) => {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 ? args[idx + 1] : null;
  };

  const subreddit = getArg('subreddit');
  const title = getArg('title');
  const bodyFile = getArg('body-file');
  const bodyArg = getArg('body');

  if (!subreddit || !title) {
    console.error('Usage: node reddit_browser_post.js --subreddit NAME --title "..." --body-file FILE');
    process.exit(1);
  }

  const body = bodyFile
    ? fs.readFileSync(path.resolve(bodyFile.replace('~', process.env.HOME)), 'utf8')
    : bodyArg;

  if (!body) {
    console.error('ERROR: Provide --body or --body-file');
    process.exit(1);
  }

  const credPath = path.join(process.env.HOME, '.config/reddit/credentials.json');
  const creds = JSON.parse(fs.readFileSync(credPath, 'utf8'));

  fs.mkdirSync(STATE_DIR, { recursive: true });

  console.log(`Posting to r/${subreddit}: "${title.substring(0, 60)}..."`);

  const browser = await firefox.launch({ headless: true });

  // Try to reuse saved session
  let context;
  if (fs.existsSync(STATE_FILE)) {
    try {
      context = await browser.newContext({
        storageState: STATE_FILE,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:131.0) Gecko/20100101 Firefox/131.0',
        viewport: { width: 1280, height: 800 },
        locale: 'en-US',
      });
    } catch (e) {
      console.log('Saved session invalid, starting fresh');
      context = null;
    }
  }
  if (!context) {
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:131.0) Gecko/20100101 Firefox/131.0',
      viewport: { width: 1280, height: 800 },
      locale: 'en-US',
    });
  }

  const page = await context.newPage();

  try {
    // Check if already logged in
    await page.goto('https://www.reddit.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    const url = page.url();
    const isLoggedIn = !url.includes('/login') && !url.includes('/register');

    // Verify by checking for user-related element or URL pattern
    if (!isLoggedIn || url.includes('/login')) {
      await login(page, creds);
      await context.storageState({ path: STATE_FILE });
    } else {
      console.log('Using saved session');
    }

    // Post
    const finalUrl = await postToSubreddit(page, context, subreddit, title, body);
    await context.storageState({ path: STATE_FILE });

    if (finalUrl.includes('/comments/') || (finalUrl.includes('/r/') && !finalUrl.includes('/submit'))) {
      console.log(`OK: Posted to r/${subreddit}`);
      console.log(`URL: ${finalUrl}`);
      await page.screenshot({ path: '/tmp/reddit-success.png' });
    } else {
      console.error(`WARN: Unexpected URL after submit: ${finalUrl}`);
      await page.screenshot({ path: '/tmp/reddit-after-post.png' });
      console.error('Screenshot: /tmp/reddit-after-post.png');
    }

  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    await page.screenshot({ path: '/tmp/reddit-error.png' }).catch(() => {});
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
