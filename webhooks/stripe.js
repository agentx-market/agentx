// Stripe webhook handler
// Processes subscription lifecycle events

const db = require('../db');

function handle(payload, headers) {
  const type = payload.type;
  const data = payload.data?.object;

  if (!type || !data) {
    return { status: 'ignored', reason: 'missing type or data' };
  }

  console.log(`[stripe] Event: ${type}`);

  switch (type) {
    case 'checkout.session.completed': {
      const customerId = data.customer;
      const email = data.customer_email || data.customer_details?.email;
      if (customerId && email) {
        db.run(
          `INSERT OR IGNORE INTO stripe_customers (stripe_customer_id, email) VALUES (?, ?)`,
          [customerId, email]
        );
        console.log(`[stripe] Customer created: ${customerId} (${email})`);
      }
      break;
    }

    case 'invoice.paid': {
      const customerId = data.customer;
      const subscriptionId = data.subscription;
      if (subscriptionId) {
        db.run(
          `UPDATE subscriptions SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE stripe_subscription_id = ?`,
          [subscriptionId]
        );
        console.log(`[stripe] Invoice paid for subscription ${subscriptionId}`);
      }
      break;
    }

    case 'invoice.payment_failed': {
      const subscriptionId = data.subscription;
      if (subscriptionId) {
        db.run(
          `UPDATE subscriptions SET status = 'past_due', updated_at = CURRENT_TIMESTAMP WHERE stripe_subscription_id = ?`,
          [subscriptionId]
        );
        console.log(`[stripe] Payment failed for subscription ${subscriptionId}`);
      }
      break;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const customerId = data.customer;
      const subscriptionId = data.id;
      const status = data.status;
      const periodStart = data.current_period_start ? new Date(data.current_period_start * 1000).toISOString() : null;
      const periodEnd = data.current_period_end ? new Date(data.current_period_end * 1000).toISOString() : null;

      db.run(
        `INSERT INTO subscriptions (stripe_customer_id, stripe_subscription_id, status, current_period_start, current_period_end)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(stripe_subscription_id) DO UPDATE SET
           status = excluded.status,
           current_period_start = excluded.current_period_start,
           current_period_end = excluded.current_period_end,
           updated_at = CURRENT_TIMESTAMP`,
        [customerId, subscriptionId, status, periodStart, periodEnd]
      );
      console.log(`[stripe] Subscription ${subscriptionId} → ${status}`);
      break;
    }

    case 'customer.subscription.deleted': {
      const subscriptionId = data.id;
      db.run(
        `UPDATE subscriptions SET status = 'canceled', updated_at = CURRENT_TIMESTAMP WHERE stripe_subscription_id = ?`,
        [subscriptionId]
      );
      console.log(`[stripe] Subscription ${subscriptionId} canceled`);
      break;
    }

    default:
      console.log(`[stripe] Unhandled event type: ${type}`);
      return { status: 'ok', handled: false, type };
  }

  return { status: 'ok', handled: true, type };
}

module.exports = { handle };
