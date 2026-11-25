'use strict';
// Payment adapter for booth fees, subscriptions and refunds (GEN-01).
//
// - No STRIPE_SECRET_KEY: "simulated" mode. Payments complete immediately and are
//   recorded in the database, so the whole flow can be tested. Set SIMULATE_DECLINE=1
//   to make every simulated charge fail (tests the failed-payment path, VEN-23).
// - STRIPE_SECRET_KEY set: Stripe Checkout (test or live keys). The vendor is sent to
//   Stripe, and the return URL confirms the payment. Not yet exercised against a live
//   Stripe account in this environment; see the handoff notes.

const crypto = require('crypto');
const { APP_URL } = require('./notify');

const KEY = process.env.STRIPE_SECRET_KEY || '';
const CURRENCY = (process.env.STRIPE_CURRENCY || 'cad').toLowerCase();

function mode() {
  if (!KEY) return 'simulated';
  return KEY.startsWith('sk_live') ? 'live' : 'test';
}

let stripeClient = null;
function stripe() {
  if (!stripeClient) {
    const Stripe = require('stripe');
    stripeClient = new Stripe(KEY);
  }
  return stripeClient;
}

// Start a one-off payment. Returns either an immediate result (simulated) or a checkout URL (Stripe).
// purpose: { kind: 'booth_fee' | 'subscription', ref: <id>, description, amount_cents, successPath, cancelPath }
async function startCharge(purpose) {
  if (mode() === 'simulated') {
    if (process.env.SIMULATE_DECLINE === '1') return { status: 'failed', provider: 'simulated', ref: null };
    return { status: 'succeeded', provider: 'simulated', ref: 'sim_' + crypto.randomBytes(8).toString('hex') };
  }
  const session = await stripe().checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: CURRENCY,
          unit_amount: purpose.amount_cents,
          product_data: { name: purpose.description },
        },
      },
    ],
    success_url: APP_URL + purpose.successPath + (purpose.successPath.includes('?') ? '&' : '?') + 'session_id={CHECKOUT_SESSION_ID}',
    cancel_url: APP_URL + purpose.cancelPath,
    metadata: { kind: purpose.kind, ref: String(purpose.ref) },
  });
  return { status: 'pending', provider: 'stripe', ref: session.id, checkout_url: session.url };
}

// Confirm a Stripe Checkout session after the vendor returns. Returns { paid, paymentIntent, amount }.
async function confirmSession(sessionId) {
  const s = await stripe().checkout.sessions.retrieve(sessionId);
  return { paid: s.payment_status === 'paid', paymentIntent: s.payment_intent, amount: s.amount_total, metadata: s.metadata || {} };
}

// Refund a successful charge. ref is the provider reference stored on the original payment.
async function refund({ ref, amount_cents, provider }) {
  if (provider !== 'stripe' || mode() === 'simulated') {
    return { status: 'refunded', ref: 'refund_' + crypto.randomBytes(8).toString('hex') };
  }
  const r = await stripe().refunds.create({ payment_intent: ref, amount: amount_cents });
  return { status: r.status === 'failed' ? 'failed' : 'refunded', ref: r.id };
}

module.exports = { mode, startCharge, confirmSession, refund, CURRENCY };
