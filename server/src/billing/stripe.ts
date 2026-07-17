import Stripe from 'stripe';
import { config } from '../config.js';
import type { DataStore, License } from '../store/types.js';

// Stripe wiring. The license-granting logic is factored into pure functions that
// take a DataStore, so it can be unit-tested without a live Stripe account.

let client: Stripe | null | undefined;

/** The Stripe client, or null when no secret key is configured (local dev). */
export function getStripe(): Stripe | null {
  if (client === undefined) {
    client = config.stripe.secretKey ? new Stripe(config.stripe.secretKey) : null;
  }
  return client;
}

/** Grant (or extend) a one-year license for a completed purchase. */
export async function grantLicense(
  store: DataStore,
  args: { userId: string; sessionId?: string; customerId?: string }
): Promise<License> {
  const now = Date.now();
  const existing = await store.getLicense(args.userId);
  // Extend from the later of now / current expiry so a renewal stacks a year on.
  const base =
    existing && !existing.refundedAt && existing.expiresAt > now
      ? existing.expiresAt
      : now;
  const license: License = {
    userId: args.userId,
    plan: 'annual',
    purchasedAt: now,
    expiresAt: base + config.license.days * 24 * 60 * 60 * 1000,
    stripeSessionId: args.sessionId,
    stripeCustomerId: args.customerId,
  };
  await store.putLicense(license);
  if (args.customerId) {
    await store.updateUser(args.userId, { stripeCustomerId: args.customerId });
  }
  return license;
}

/** Mark a user's license refunded (money-back guarantee). */
export async function revokeLicense(
  store: DataStore,
  userId: string
): Promise<void> {
  const license = await store.getLicense(userId);
  if (!license) return;
  await store.putLicense({ ...license, refundedAt: Date.now() });
}

/**
 * Apply a Stripe webhook event to the data store. Pure enough to unit-test:
 * pass a constructed event and a MemoryStore.
 */
export async function handleStripeEvent(
  event: Stripe.Event,
  store: DataStore
): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId =
        session.metadata?.userId ?? session.client_reference_id ?? undefined;
      if (!userId) return;
      await grantLicense(store, {
        userId,
        sessionId: session.id,
        customerId:
          typeof session.customer === 'string' ? session.customer : undefined,
      });
      return;
    }
    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge;
      let userId = charge.metadata?.userId as string | undefined;
      if (!userId && typeof charge.customer === 'string') {
        const user = await store.getUserByStripeCustomerId(charge.customer);
        userId = user?.id;
      }
      if (userId) await revokeLicense(store, userId);
      return;
    }
    default:
      return; // ignore other event types
  }
}
