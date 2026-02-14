import crypto from 'crypto';

/**
 * Stripe Test Helpers
 *
 * Functions for mocking Stripe webhooks and generating test signatures.
 */

/**
 * Generate a mock Stripe webhook payload
 */
export function generateStripeWebhookPayload(
  type: 'checkout.session.completed' | 'payment_intent.succeeded',
  data: {
    sessionId?: string;
    paymentIntentId?: string;
    amount?: number;
    currency?: string;
    customerEmail?: string;
    metadata?: Record<string, string>;
  }
) {
  const timestamp = Math.floor(Date.now() / 1000);

  if (type === 'checkout.session.completed') {
    return {
      id: `evt_${randomString(24)}`,
      object: 'event',
      api_version: '2023-10-16',
      created: timestamp,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: data.sessionId || `cs_test_${randomString(32)}`,
          object: 'checkout.session',
          amount_total: data.amount || 5000,
          currency: data.currency || 'usd',
          customer_email: data.customerEmail || 'test@example.com',
          metadata: data.metadata || {},
          payment_status: 'paid',
          status: 'complete',
        },
      },
    };
  }

  // payment_intent.succeeded
  return {
    id: `evt_${randomString(24)}`,
    object: 'event',
    api_version: '2023-10-16',
    created: timestamp,
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: data.paymentIntentId || `pi_${randomString(24)}`,
        object: 'payment_intent',
        amount: data.amount || 5000,
        currency: data.currency || 'usd',
        metadata: data.metadata || {},
        status: 'succeeded',
      },
    },
  };
}

/**
 * Generate Stripe webhook signature
 *
 * Implements the same signature algorithm that Stripe uses.
 * See: https://stripe.com/docs/webhooks/signatures
 */
export function generateStripeSignature(
  payload: string,
  secret: string,
  timestamp?: number
): string {
  const actualTimestamp = timestamp || Math.floor(Date.now() / 1000);

  // Construct the signed payload string
  const signedPayload = `${actualTimestamp}.${payload}`;

  // Create HMAC SHA256 signature
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload, 'utf8')
    .digest('hex');

  // Return in Stripe's format: t=timestamp,v1=signature
  return `t=${actualTimestamp},v1=${signature}`;
}

/**
 * Generate random string for IDs
 */
function randomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
