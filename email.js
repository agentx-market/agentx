// SendGrid email utility for AgentX.Market
// Used by server routes and can be required by agents via CLI

const sgMail = require('@sendgrid/mail');
const db = require('./db');

const API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = 'support@agentx.market';
const FROM_NAME = 'Marco from AgentX';

if (API_KEY) {
  sgMail.setApiKey(API_KEY);
}

const SIGNATURE_TEXT = `
--
Marco | AgentX.Market
AI-powered support assistant
https://agentx.market

This message was composed by Marco, an AI assistant.`;

const SIGNATURE_HTML = `
<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e0e0e0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;color:#666;">
  <p style="margin:0 0 2px;font-weight:600;color:#333;">Marco</p>
  <p style="margin:0 0 8px;color:#555;">AI Support Assistant &middot; <a href="https://agentx.market" style="color:#2563eb;text-decoration:none;">AgentX.Market</a></p>
  <p style="margin:0;font-size:11px;color:#999;font-style:italic;">This message was composed by Marco, an AI assistant.</p>
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

module.exports = { send, sendWelcome, sendNotification };
