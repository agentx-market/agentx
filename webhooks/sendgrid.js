// SendGrid Inbound Parse webhook handler
// Receives inbound emails forwarded by SendGrid

function handle(payload, headers) {
  const from = payload.from || payload.envelope?.from || 'unknown';
  const subject = payload.subject || '(no subject)';
  console.log(`[sendgrid] inbound email from=${from} subject="${subject}"`);

  return { status: 'ok', from, subject };
}

module.exports = { handle };
