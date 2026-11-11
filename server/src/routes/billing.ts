import type { FastifyInstance } from 'fastify';
import type Stripe from 'stripe';
import { config } from '../config.js';
import { getStore } from '../store/index.js';
import { requireAuth } from '../auth/session.js';
import { getStripe, handleStripeEvent } from '../billing/stripe.js';

// Stripe Checkout (one-time $35) + the webhook that actually grants the license.
// The webhook is the source of truth — the client's post-checkout return page
// only re-reads GET /license.

export async function billingRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/checkout', { preHandler: requireAuth }, async (request, reply) => {
    const stripe = getStripe();
    if (!stripe) {
      return reply.code(503).send({ message: 'Payments are not configured.' });
    }
    const store = await getStore();
    const user = await store.getUserById(request.userId!);
    if (!user) return reply.code(401).send({ message: 'Not signed in.' });

    // Reuse the user's Stripe customer if we have one, else let Checkout create
    // one and capture it from the webhook.
    const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = config.stripe
      .priceId
      ? { price: config.stripe.priceId, quantity: 1 }
      : {
          quantity: 1,
          price_data: {
            currency: config.license.currency,
            unit_amount: config.license.priceCents,
            product_data: { name: config.license.productName },
          },
        };

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [lineItem],
      // Payment-mode Checkout only creates a Customer when asked to; without
      // one, a later refund can't be traced back to the user by customer id.
      ...(user.stripeCustomerId
        ? { customer: user.stripeCustomerId }
        : { customer_email: user.email, customer_creation: 'always' as const }),
      client_reference_id: user.id,
      metadata: { userId: user.id },
      payment_intent_data: { metadata: { userId: user.id } },
      success_url: `${config.publicBaseUrl}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.publicBaseUrl}/account/billing?canceled=1`,
    });

    return reply.send({ url: session.url });
  });

  // Stripe posts here. Signature is verified against the raw body (captured by
  // the content-type parser in app.ts as request.rawBody).
  fastify.post('/webhooks/stripe', async (request, reply) => {
    const stripe = getStripe();
    if (!stripe || !config.stripe.webhookSecret) {
      return reply.code(503).send({ message: 'Webhooks are not configured.' });
    }
    const sig = request.headers['stripe-signature'];
    const raw = request.rawBody;
    if (!sig || !raw) return reply.code(400).send({ message: 'Missing signature.' });

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(raw, sig, config.stripe.webhookSecret);
    } catch (err) {
      request.log.warn({ err }, 'Stripe signature verification failed');
      return reply.code(400).send({ message: 'Invalid signature.' });
    }

    const store = await getStore();
    await handleStripeEvent(event, store);
    return reply.send({ received: true });
  });
}

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: string;
  }
}
