// GitHub webhook handler
// Receives push events, PR events, etc.

function handle(payload, headers) {
  const event = headers['x-github-event'] || 'unknown';
  const delivery = headers['x-github-delivery'] || 'none';
  console.log(`[github] event=${event} delivery=${delivery}`);

  // Log key details based on event type
  switch (event) {
    case 'push':
      console.log(`[github] push to ${payload.ref} by ${payload.pusher?.name}`);
      break;
    case 'pull_request':
      console.log(`[github] PR #${payload.number} ${payload.action} — ${payload.pull_request?.title}`);
      break;
    case 'issues':
      console.log(`[github] issue #${payload.number} ${payload.action} — ${payload.issue?.title}`);
      break;
    default:
      console.log(`[github] ${event} action=${payload.action || 'n/a'}`);
  }

  return { status: 'ok', event, delivery };
}

module.exports = { handle };
