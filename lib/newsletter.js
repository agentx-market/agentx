const email = require('../email');

const TOPIC_DEFINITIONS = [
  { value: 'new_listings', label: 'New listings' },
  { value: 'api_updates', label: 'API updates' },
  { value: 'best_of_roundups', label: 'Best-of roundups' },
];

const TOPIC_VALUES = new Set(TOPIC_DEFINITIONS.map((topic) => topic.value));

function normalizeTopics(input) {
  const rawValues = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? input.split(',')
      : [];

  return [...new Set(
    rawValues
      .map((value) => String(value || '').trim().toLowerCase())
      .filter((value) => TOPIC_VALUES.has(value))
  )];
}

function getSyncTargets() {
  return [
    {
      provider: 'mailchimp',
      url: process.env.MAILCHIMP_NEWSLETTER_WEBHOOK_URL || process.env.MAILCHIMP_WEBHOOK_URL || '',
    },
    {
      provider: 'convertkit',
      url: process.env.CONVERTKIT_NEWSLETTER_WEBHOOK_URL || process.env.CONVERTKIT_WEBHOOK_URL || '',
    },
  ].filter((target) => target.url);
}

async function syncSubscriber({ emailAddress, topics, sourcePath, subscribedAt }) {
  const targets = getSyncTargets();

  if (targets.length === 0) {
    return [];
  }

  const payload = {
    email: emailAddress,
    topics,
    source_path: sourcePath,
    subscribed_at: subscribedAt,
    sequence: 'newsletter_welcome',
  };

  return Promise.all(targets.map(async (target) => {
    try {
      const response = await fetch(target.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return { provider: target.provider, success: true };
    } catch (error) {
      console.error(`[newsletter] ${target.provider} sync failed:`, error.message);
      return { provider: target.provider, success: false, error: error.message };
    }
  }));
}

async function sendWelcomeSequenceEmail({ emailAddress, topics }) {
  const topicLabels = topics.length
    ? TOPIC_DEFINITIONS
        .filter((topic) => topics.includes(topic.value))
        .map((topic) => topic.label.toLowerCase())
        .join(', ')
    : 'operator updates';

  return email.send({
    to: emailAddress,
    subject: 'You are on the AgentX newsletter',
    html: `
      <h2>Welcome to the AgentX newsletter</h2>
      <p>You will get the next wave of ${topicLabels} straight from the marketplace.</p>
      <p>We use this list to ship:</p>
      <ul>
        <li>New operator-backed listings worth watching</li>
        <li>API and platform updates that change how you integrate</li>
        <li>Short roundups instead of filler</li>
      </ul>
      <p>You can reply to this email if there is a feed or operator segment you want covered.</p>
    `,
    text: `Welcome to the AgentX newsletter.\n\nYou will get the next wave of ${topicLabels} straight from the marketplace.\n\nWe use this list for new operator-backed listings, API updates, and concise roundups.`,
  });
}

module.exports = {
  TOPIC_DEFINITIONS,
  normalizeTopics,
  syncSubscriber,
  sendWelcomeSequenceEmail,
};
