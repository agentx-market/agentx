// Gmail utility for Marco — send/receive via marcoagent42@gmail.com
// Uses nodemailer (SMTP) for sending, IMAP for receiving
// App Password stored at ~/.openclaw/credentials/gmail.env

const nodemailer = require('nodemailer');
const Imap = require('node-imap') !== undefined ? require('node-imap') : null;
const fs = require('fs');
const path = require('path');

const GMAIL_ADDRESS = 'marcoagent42@gmail.com';
const GMAIL_APP_PASSWORD = 'REDACTED';

// SMTP transporter for sending
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: GMAIL_ADDRESS,
    pass: GMAIL_APP_PASSWORD,
  },
});

/**
 * Send an email from Marco's Gmail
 * @param {object} opts - { to, subject, text, html, attachments }
 * attachments format: [{ filename: 'file.png', path: '/path/to/file' }]
 */
async function send({ to, subject, text, html, attachments }) {
  const msg = {
    from: { name: 'Marco', address: GMAIL_ADDRESS },
    to,
    subject,
    ...(text ? { text } : {}),
    ...(html ? { html } : {}),
    ...(attachments ? { attachments } : {}),
  };

  try {
    const info = await transporter.sendMail(msg);
    console.log(`[gmail] Sent to ${to}: ${subject} (messageId: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[gmail] Failed to send to ${to}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Check Gmail inbox via IMAP — returns recent messages
 * @param {number} count - number of recent messages to fetch (default 5)
 * @param {boolean} unseen - only fetch unseen messages (default false)
 */
function checkInbox(count = 5, unseen = false) {
  return new Promise((resolve, reject) => {
    const imap = new (require('node-imap'))({
      user: GMAIL_ADDRESS,
      password: GMAIL_APP_PASSWORD,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: true },
    });

    const messages = [];

    imap.once('ready', () => {
      imap.openBox('INBOX', true, (err, box) => {
        if (err) { imap.end(); return reject(err); }

        const total = box.messages.total;
        if (total === 0) { imap.end(); return resolve([]); }

        const searchCriteria = unseen ? ['UNSEEN'] : ['ALL'];
        imap.search(searchCriteria, (err, results) => {
          if (err) { imap.end(); return reject(err); }
          if (!results || results.length === 0) { imap.end(); return resolve([]); }

          // Get the last N messages
          const ids = results.slice(-count);
          const fetch = imap.fetch(ids, {
            bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE)', 'TEXT'],
            struct: true,
          });

          fetch.on('message', (msg, seqno) => {
            const email = { seqno, headers: {}, body: '', attachments: [] };

            msg.on('body', (stream, info) => {
              let buffer = '';
              stream.on('data', (chunk) => { buffer += chunk.toString('utf8'); });
              stream.on('end', () => {
                if (info.which === 'TEXT') {
                  email.body = buffer.slice(0, 2000); // truncate
                } else {
                  // Parse headers
                  const lines = buffer.split('\r\n');
                  for (const line of lines) {
                    const match = line.match(/^(From|To|Subject|Date):\s*(.+)/i);
                    if (match) email.headers[match[1].toLowerCase()] = match[2];
                  }
                }
              });
            });

            msg.on('attributes', (attrs) => {
              email.uid = attrs.uid;
              email.flags = attrs.flags;
              // Check for attachments in structure
              if (attrs.struct) {
                const findAttachments = (parts) => {
                  if (!Array.isArray(parts)) return;
                  for (const part of parts) {
                    if (Array.isArray(part)) { findAttachments(part); continue; }
                    if (part.disposition && part.disposition.type === 'ATTACHMENT') {
                      email.attachments.push({
                        filename: part.disposition.params?.filename || 'unknown',
                        type: `${part.type}/${part.subtype}`,
                        size: part.size,
                      });
                    }
                  }
                };
                findAttachments(attrs.struct);
              }
            });

            msg.once('end', () => { messages.push(email); });
          });

          fetch.once('error', (err) => { imap.end(); reject(err); });
          fetch.once('end', () => { imap.end(); });
        });
      });
    });

    imap.once('error', (err) => reject(err));
    imap.once('end', () => resolve(messages));
    imap.connect();
  });
}

/**
 * Verify SMTP connection works
 */
async function verify() {
  try {
    await transporter.verify();
    console.log('[gmail] SMTP connection verified');
    return { success: true };
  } catch (err) {
    console.error('[gmail] SMTP verification failed:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { send, checkInbox, verify, GMAIL_ADDRESS };
