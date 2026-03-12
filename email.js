// SendGrid email utility for AgentX.Market
// Used by server routes and can be required by agents via CLI

const sgMail = require('@sendgrid/mail');
const db = require('./db');

const API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = 'marco@agentx.market';
const FROM_NAME = 'Marco';

if (API_KEY) {
  sgMail.setApiKey(API_KEY);
}

const SIGNATURE_TEXT = `
—
Marco — AI-Powered Assistant
marco@agentx.market
agentx.market

"Always on. Always building. Always working for you."`;

const SIGNATURE_HTML = `
<div style="margin-top:20px;padding-top:12px;border-top:1px solid #e8e8e8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;line-height:1.5;">
  <span style="color:#444;font-weight:500;">Marco</span> <span style="color:#999;">— AI-Powered Assistant</span><br>
  <a href="mailto:marco@agentx.market" style="color:#888;text-decoration:none;">marco@agentx.market</a> · <a href="https://agentx.market" style="color:#888;text-decoration:none;">agentx.market</a><br>
  <span style="color:#aaa;font-style:italic;font-size:12px;">Always on. Always building. Always working for you.</span>
</div>`;

async function send({ to, subject, html, text, inReplyTo, references, inboundEmailId, noSignature }) {
  if (!API_KEY) {
    console.error('[email] SENDGRID_API_KEY not set — email not sent');
    logOutbound({ to, subject, text, html, inReplyTo, inboundEmailId, status: 'failed', error: 'SENDGRID_API_KEY not configured' });
    return { success: false, error: 'SENDGRID_API_KEY not configured' };
  }

  // Normalize literal \n from shell-passed text
  const cleanText = text ? text.replace(/\\n/g, '\n') : null;

  // Strip any agent-added signature lines (Marco — AgentX.Market, Best regards, etc.)
  // so we don't double-sign
  const stripAgentSig = (t) => {
    if (!t) return t;
    return t.replace(/\n*(?:Best regards,?\s*\n)?Marco\s*[-—–]\s*AgentX\.Market\s*$/i, '').trimEnd();
  };

  const bodyText = stripAgentSig(cleanText);
  const bodyHtml = html ? html.replace(/<p>\s*(?:Best regards,?\s*<br\/?>)?\s*Marco\s*[-—–]\s*AgentX\.Market\s*<\/p>\s*$/i, '') : null;

  // Build message with signature
  const msg = {
    to,
    from: { email: FROM_EMAIL, name: FROM_NAME },
    subject,
  };

  if (!noSignature) {
    if (bodyHtml) {
      msg.html = bodyHtml + SIGNATURE_HTML;
    } else if (bodyText) {
      // Convert text to simple HTML with signature
      const escapedBody = bodyText
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
      msg.html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#222;">${escapedBody}</div>${SIGNATURE_HTML}`;
    }
    msg.text = (bodyText || '') + SIGNATURE_TEXT;
  } else {
    if (bodyHtml) msg.html = bodyHtml;
    if (bodyText) msg.text = bodyText;
  }

  msg.trackingSettings = {
    clickTracking: { enable: false, enableText: false },
    openTracking: { enable: false },
  };

  // Add threading headers for reply threading in email clients
  if (inReplyTo || references) {
    msg.headers = {};
    if (inReplyTo) msg.headers['In-Reply-To'] = inReplyTo;
    if (references) {
      msg.headers['References'] = references;
    } else if (inReplyTo) {
      msg.headers['References'] = inReplyTo;
    }
  }

  try {
    const [response] = await sgMail.send(msg);
    const sgMessageId = response?.headers?.['x-message-id'] || null;
    console.log(`[email] Sent to ${to}: ${subject} (sgId=${sgMessageId})`);
    logOutbound({ to, subject, text: bodyText, html: msg.html, inReplyTo, references: msg.headers?.['References'], inboundEmailId, status: 'sent', sgMessageId });
    return { success: true, messageId: sgMessageId };
  } catch (err) {
    const body = err.response?.body;
    const errorMsg = body ? JSON.stringify(body) : err.message;
    console.error(`[email] Failed to send to ${to}:`, body || err.message);
    logOutbound({ to, subject, text: bodyText, html: msg.html, inReplyTo, inboundEmailId, status: 'failed', error: errorMsg });
    return { success: false, error: body || err.message };
  }
}

function logOutbound({ to, subject, text, html, inReplyTo, references, inboundEmailId, status, error, sgMessageId }) {
  try {
    db.run(
      `INSERT INTO outbound_emails (to_address, from_address, subject, body_text, body_html, in_reply_to, references_header, inbound_email_id, sendgrid_message_id, status, error_text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        to || '',
        FROM_EMAIL,
        subject || '',
        text || null,
        html || null,
        inReplyTo || null,
        references || null,
        inboundEmailId || null,
        sgMessageId || null,
        status,
        error || null,
      ]
    );
  } catch (err) {
    console.error('[email] Failed to log outbound email:', err.message);
  }
}

async function sendWelcome(email, name) {
  return send({
    to: email,
    subject: 'Welcome to AgentX.Market - Get Started',
    html: `
      <h2>Welcome to AgentX${name ? `, ${name}` : ''}!</h2>
      <p>Thanks for signing up for AgentX.Market, the AI agent marketplace.</p>
      <p>Here's how to get started:</p>
      <ol>
        <li><a href="https://agentx.market/getting-started">Getting Started Guide</a> - Learn the basics</li>
        <li><a href="https://agentx.market/docs">API Documentation</a> - Explore our API endpoints</li>
        <li><a href="https://agentx.market/browse">Register Your First Agent</a> - Add your AI agent to the marketplace</li>
      </ol>
      <p>Have questions? Reply to this email and we'll help you out.</p>
      <p>Happy building! 🚀</p>
    `,
  });
}

async function sendNotification(subject, body) {
  return send({
    to: 'paul@agentx.market',
    subject: `[AgentX] ${subject}`,
    html: `<pre>${body}</pre>`,
    noSignature: true,
  });
}

async function sendVerificationApplicationReceived(emailAddress, payload) {
  return send({
    to: emailAddress,
    subject: 'AgentX verification application received',
    html: `
      <h2>Verification request received</h2>
      <p>We received your verification badge application for <a href="${payload.agentUrl}">${payload.agentUrl}</a>.</p>
      <p>What happens next:</p>
      <ol>
        <li>We review your production presence and ownership signals.</li>
        <li>We verify the submitted evidence links.</li>
        <li>We approve the badge or send a rejection reason.</li>
      </ol>
      <p>Submitted business website: <a href="${payload.businessWebsite}">${payload.businessWebsite}</a></p>
      <p>Review queue reference: #${payload.requestId}</p>
    `,
    text: [
      'Verification request received',
      '',
      `We received your verification badge application for ${payload.agentUrl}.`,
      `Business website: ${payload.businessWebsite}`,
      `Review queue reference: #${payload.requestId}`,
      '',
      'We will manually review the submission and follow up by email.',
    ].join('\n'),
  });
}

async function sendVerificationApproved(emailAddress, payload) {
  return send({
    to: emailAddress,
    subject: 'Your AgentX verification badge was approved',
    html: `
      <h2>Verification approved</h2>
      <p>Your agent has been approved for the AgentX verification badge.</p>
      <p><a href="${payload.agentUrl}">View your verified listing</a></p>
      <p>The blue checkmark is now visible on the listing page and marketplace surfaces.</p>
    `,
    text: [
      'Verification approved',
      '',
      'Your agent has been approved for the AgentX verification badge.',
      `View your listing: ${payload.agentUrl}`,
      '',
      'The blue checkmark is now live.',
    ].join('\n'),
  });
}

async function sendVerificationRejected(emailAddress, payload) {
  return send({
    to: emailAddress,
    subject: 'Update on your AgentX verification application',
    html: `
      <h2>Verification not approved</h2>
      <p>We reviewed your verification application for <a href="${payload.agentUrl}">${payload.agentUrl}</a> and cannot approve it yet.</p>
      <p><strong>Reason:</strong> ${payload.reason}</p>
      <p>You can reapply after addressing the issue and strengthening the evidence links.</p>
    `,
    text: [
      'Verification not approved',
      '',
      `We reviewed your verification application for ${payload.agentUrl} and cannot approve it yet.`,
      `Reason: ${payload.reason}`,
      '',
      'You can reapply after addressing the issue and strengthening the evidence links.',
    ].join('\n'),
  });
}

module.exports = {
  send,
  sendWelcome,
  sendNotification,
  sendVerificationApplicationReceived,
  sendVerificationApproved,
  sendVerificationRejected,
};
