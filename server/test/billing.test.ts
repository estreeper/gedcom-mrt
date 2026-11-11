import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { buildApp } from '../src/app.js';
import { config } from '../src/config.js';
import { MemoryStore } from '../src/store/memory.js';
import { setStore } from '../src/store/index.js';
import { licenseStatus } from '../src/store/types.js';
import {
  getStripe,
  setStripe,
  grantLicense,
  revokeLicense,
  handleStripeEvent,
} from '../src/billing/stripe.js';

// Billing: the license-granting rules, the signature-verified webhook, and the
// Checkout session we ask Stripe to create. No network — signatures are made
// and checked locally and the Checkout call is a spy.

const DAY = 24 * 60 * 60 * 1000;
const WEBHOOK_SECRET = 'whsec_test_secret';

let app: FastifyInstance;
let store: MemoryStore;
const saved = { ...config.stripe };

beforeEach(async () => {
  store = new MemoryStore();
  setStore(store);
  app = await buildApp();
  await app.ready();
});

afterEach(() => {
  Object.assign(config.stripe, saved);
  setStripe(undefined);
  vi.useRealTimers();
});

async function newUser(email = 'buyer@example.com') {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/signup',
    payload: { email, password: 'password123' },
  });
  const c = res.cookies.find((c) => c.name === 'gmrt_session')!;
  return { id: res.json().user.id as string, cookie: `${c.name}=${c.value}` };
}

const event = (type: string, object: Record<string, unknown>) =>
  ({ type, data: { object } }) as unknown as Stripe.Event;

describe('licenseStatus', () => {
  const base = { userId: 'u', plan: 'annual' as const, purchasedAt: 0 };
  it('derives none / active / expired / refunded', () => {
    expect(licenseStatus(null, 1000)).toBe('none');
    expect(licenseStatus({ ...base, expiresAt: 1001 }, 1000)).toBe('active');
    expect(licenseStatus({ ...base, expiresAt: 1000 }, 1000)).toBe('expired');
    expect(licenseStatus({ ...base, expiresAt: 9999, refundedAt: 5 }, 1000)).toBe('refunded');
  });
});

describe('grantLicense', () => {
  it('grants the configured number of days from now', async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const lic = await grantLicense(store, { userId: 'u1', sessionId: 'cs_1' });
    expect(lic.expiresAt).toBe(1_000_000 + config.license.days * DAY);
    expect(lic.stripeSessionId).toBe('cs_1');
  });

  it('stacks a renewal on top of the remaining time', async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const first = await grantLicense(store, { userId: 'u1', sessionId: 'cs_1' });
    vi.setSystemTime(1_000_000 + 10 * DAY);
    const second = await grantLicense(store, { userId: 'u1', sessionId: 'cs_2' });
    expect(second.expiresAt).toBe(first.expiresAt + config.license.days * DAY);
  });

  it('starts from now when the previous license has expired or was refunded', async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    await grantLicense(store, { userId: 'u1', sessionId: 'cs_1' });
    vi.setSystemTime(1_000_000 + 500 * DAY);
    const afterExpiry = await grantLicense(store, { userId: 'u1', sessionId: 'cs_2' });
    expect(afterExpiry.expiresAt).toBe(Date.now() + config.license.days * DAY);

    await revokeLicense(store, 'u1');
    vi.setSystemTime(1_000_000 + 501 * DAY);
    const afterRefund = await grantLicense(store, { userId: 'u1', sessionId: 'cs_3' });
    expect(afterRefund.expiresAt).toBe(Date.now() + config.license.days * DAY);
    expect(afterRefund.refundedAt).toBeUndefined();
  });

  it('is idempotent for a redelivered checkout session', async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const first = await grantLicense(store, { userId: 'u1', sessionId: 'cs_1' });
    vi.setSystemTime(1_000_000 + DAY);
    const again = await grantLicense(store, { userId: 'u1', sessionId: 'cs_1' });
    expect(again.expiresAt).toBe(first.expiresAt);
    expect((await store.getLicense('u1'))!.expiresAt).toBe(first.expiresAt);
  });

  it('remembers the Stripe customer on the user', async () => {
    const user = await store.createUser({ id: '', email: 'c@example.com' });
    await grantLicense(store, { userId: user.id, customerId: 'cus_9' });
    expect((await store.getUserByStripeCustomerId('cus_9'))?.id).toBe(user.id);
    expect(await store.getUserByStripeCustomerId('cus_other')).toBeNull();
  });
});

describe('revokeLicense', () => {
  it('does nothing when the user has no license', async () => {
    await revokeLicense(store, 'nobody');
    expect(await store.getLicense('nobody')).toBeNull();
  });
});

describe('handleStripeEvent', () => {
  const status = async (userId: string) =>
    licenseStatus(await store.getLicense(userId), Date.now());

  it('grants once however many times the completed event is delivered', async () => {
    const e = event('checkout.session.completed', {
      id: 'cs_dup',
      metadata: { userId: 'u1' },
      payment_status: 'paid',
    });
    await handleStripeEvent(e, store);
    const first = (await store.getLicense('u1'))!.expiresAt;
    await handleStripeEvent(e, store);
    await handleStripeEvent(e, store);
    expect((await store.getLicense('u1'))!.expiresAt).toBe(first);
  });

  it('falls back to client_reference_id and ignores sessions naming no user', async () => {
    await handleStripeEvent(
      event('checkout.session.completed', { id: 'cs_a', client_reference_id: 'u2' }),
      store
    );
    expect(await status('u2')).toBe('active');
    await handleStripeEvent(event('checkout.session.completed', { id: 'cs_b' }), store);
  });

  it('waits for the money on delayed payment methods', async () => {
    const session = { id: 'cs_slow', metadata: { userId: 'u3' } };
    await handleStripeEvent(
      event('checkout.session.completed', { ...session, payment_status: 'unpaid' }),
      store
    );
    expect(await status('u3')).toBe('none');
    await handleStripeEvent(
      event('checkout.session.async_payment_succeeded', { ...session, payment_status: 'paid' }),
      store
    );
    expect(await status('u3')).toBe('active');
  });

  it('revokes on a full refund, found by customer id when metadata is absent', async () => {
    const user = await store.createUser({ id: '', email: 'r@example.com' });
    await grantLicense(store, { userId: user.id, customerId: 'cus_r' });
    await handleStripeEvent(
      event('charge.refunded', { customer: 'cus_r', refunded: true, metadata: {} }),
      store
    );
    expect(await status(user.id)).toBe('refunded');
  });

  it('keeps the license on a partial refund', async () => {
    await grantLicense(store, { userId: 'u4' });
    await handleStripeEvent(
      event('charge.refunded', { refunded: false, metadata: { userId: 'u4' } }),
      store
    );
    expect(await status('u4')).toBe('active');
  });

  it('ignores refunds it cannot attribute and unrelated event types', async () => {
    await grantLicense(store, { userId: 'u5' });
    await handleStripeEvent(event('charge.refunded', { customer: 'cus_unknown', metadata: {} }), store);
    await handleStripeEvent(event('charge.refunded', { metadata: {} }), store);
    await handleStripeEvent(event('invoice.paid', { metadata: { userId: 'u5' } }), store);
    expect(await status('u5')).toBe('active');
  });
});

describe('getStripe', () => {
  it('is null without a secret key and a client with one', () => {
    setStripe(undefined);
    config.stripe.secretKey = '';
    expect(getStripe()).toBeNull();
    setStripe(undefined);
    config.stripe.secretKey = 'sk_test_123';
    expect(getStripe()).toBeInstanceOf(Stripe);
  });
});

describe('POST /api/webhooks/stripe', () => {
  const stripe = new Stripe('sk_test_123');

  function post(payload: string, signature?: string) {
    return app.inject({
      method: 'POST',
      url: '/api/webhooks/stripe',
      headers: {
        'content-type': 'application/json',
        ...(signature ? { 'stripe-signature': signature } : {}),
      },
      payload,
    });
  }

  it('is 503 when Stripe is not configured', async () => {
    setStripe(null);
    expect((await post('{}', 'sig')).statusCode).toBe(503);
    setStripe(stripe);
    config.stripe.webhookSecret = '';
    expect((await post('{}', 'sig')).statusCode).toBe(503);
  });

  it('rejects a missing or wrong signature and grants nothing', async () => {
    setStripe(stripe);
    config.stripe.webhookSecret = WEBHOOK_SECRET;
    const user = await newUser();
    const payload = JSON.stringify({
      id: 'evt_1',
      object: 'event',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_1', metadata: { userId: user.id } } },
    });
    expect((await post(payload)).statusCode).toBe(400);
    const forged = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_wrong' });
    expect((await post(payload, forged)).statusCode).toBe(400);
    expect(await store.getLicense(user.id)).toBeNull();
  });

  it('verifies the signature over the raw body and grants the license', async () => {
    setStripe(stripe);
    config.stripe.webhookSecret = WEBHOOK_SECRET;
    const user = await newUser();
    // Unusual spacing: the signature covers these exact bytes, so the route
    // must verify the raw body, not a re-serialized copy.
    const payload = `{ "id":"evt_2",  "object":"event", "type":"checkout.session.completed",
      "data":{"object":{"id":"cs_2","customer":"cus_2","payment_status":"paid","metadata":{"userId":"${user.id}"}}} }`;
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });

    const res = await post(payload, signature);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ received: true });

    const lic = await app.inject({ method: 'GET', url: '/api/license', headers: { cookie: user.cookie } });
    expect(lic.json()).toMatchObject({ status: 'active', plan: 'annual' });
    expect((await store.getUserById(user.id))?.stripeCustomerId).toBe('cus_2');
  });
});

describe('POST /api/checkout', () => {
  function fakeStripe() {
    const create = vi.fn(async (_params: Stripe.Checkout.SessionCreateParams) => ({
      url: 'https://checkout.stripe.test/pay/cs_123',
    }));
    setStripe({ checkout: { sessions: { create } } } as unknown as Stripe);
    return create;
  }
  const checkout = (cookie?: string) =>
    app.inject({ method: 'POST', url: '/api/checkout', headers: cookie ? { cookie } : {} });

  it('requires a session', async () => {
    fakeStripe();
    expect((await checkout()).statusCode).toBe(401);
  });

  it('is 503 when payments are not configured', async () => {
    setStripe(null);
    const user = await newUser();
    expect((await checkout(user.cookie)).statusCode).toBe(503);
  });

  it('is 401 when the session outlives the account', async () => {
    fakeStripe();
    const user = await newUser();
    setStore(new MemoryStore());
    expect((await checkout(user.cookie)).statusCode).toBe(401);
  });

  it('creates a one-time payment tied to the user and returns its URL', async () => {
    const create = fakeStripe();
    config.stripe.priceId = '';
    const user = await newUser('first@example.com');

    const res = await checkout(user.cookie);
    expect(res.json()).toEqual({ url: 'https://checkout.stripe.test/pay/cs_123' });

    const params = create.mock.calls[0][0];
    expect(params).toMatchObject({
      mode: 'payment',
      client_reference_id: user.id,
      metadata: { userId: user.id },
      payment_intent_data: { metadata: { userId: user.id } },
      customer_email: 'first@example.com',
      customer_creation: 'always',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: config.license.currency,
            unit_amount: config.license.priceCents,
            product_data: { name: config.license.productName },
          },
        },
      ],
    });
    expect(params.customer).toBeUndefined();
    expect(params.success_url).toBe(
      `${config.publicBaseUrl}/checkout/return?session_id={CHECKOUT_SESSION_ID}`
    );
    expect(params.cancel_url).toBe(`${config.publicBaseUrl}/account/billing?canceled=1`);
  });

  it('reuses a known Stripe customer and a configured price id', async () => {
    const create = fakeStripe();
    config.stripe.priceId = 'price_abc';
    const user = await newUser('repeat@example.com');
    await store.updateUser(user.id, { stripeCustomerId: 'cus_repeat' });

    await checkout(user.cookie);
    const params = create.mock.calls[0][0];
    expect(params.customer).toBe('cus_repeat');
    expect(params.customer_email).toBeUndefined();
    expect(params.customer_creation).toBeUndefined();
    expect(params.line_items).toEqual([{ price: 'price_abc', quantity: 1 }]);
  });
});
