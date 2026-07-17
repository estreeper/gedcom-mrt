// Central configuration, read once from the environment. In production these
// come from Cloud Run env vars (secrets injected from Secret Manager). Locally,
// everything has a safe default so the server boots with an in-memory store and
// no external services.

function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v === undefined || v === '') {
    if (fallback !== undefined) return fallback;
    return '';
  }
  return v;
}

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  port: Number(env('PORT', '8080')),
  host: env('HOST', '0.0.0.0'),
  isProd,

  /** Where to store accounts/licenses/keybags/file-metadata. */
  dataBackend: env('DATA_BACKEND', isProd ? 'firestore' : 'memory') as
    | 'memory'
    | 'firestore',
  gcpProject: env('GCP_PROJECT'),
  /** GCS bucket for ciphertext blobs (Phase 4). */
  filesBucket: env('FILES_BUCKET'),

  /** JWT signing secret for the session cookie. MUST be set in production. */
  sessionSecret: env('SESSION_SECRET', isProd ? '' : 'dev-insecure-secret'),
  sessionCookie: 'gmrt_session',
  sessionTtlDays: 30,

  /** Where the app is reachable, for building OAuth/Stripe redirect URLs. */
  publicBaseUrl: env('PUBLIC_BASE_URL', 'http://localhost:3000'),

  /** Serve the built SPA from this directory (empty = API only). */
  staticDir: env('STATIC_DIR', ''),

  license: {
    /** Days of access granted per purchase. */
    days: Number(env('LICENSE_DAYS', '365')),
    priceCents: Number(env('LICENSE_PRICE_CENTS', '3500')),
    currency: env('LICENSE_CURRENCY', 'usd'),
    productName: env('LICENSE_PRODUCT_NAME', 'GEDCOM Repair — 1 year license'),
  },

  stripe: {
    secretKey: env('STRIPE_SECRET_KEY'),
    webhookSecret: env('STRIPE_WEBHOOK_SECRET'),
    /** Optional pre-created Price id; if empty, checkout uses price_data. */
    priceId: env('STRIPE_PRICE_ID'),
  },

  google: {
    clientId: env('GOOGLE_CLIENT_ID'),
    clientSecret: env('GOOGLE_CLIENT_SECRET'),
  },
};

export function assertProdConfig(): void {
  if (!config.isProd) return;
  const missing: string[] = [];
  if (!config.sessionSecret) missing.push('SESSION_SECRET');
  if (!config.stripe.secretKey) missing.push('STRIPE_SECRET_KEY');
  if (!config.stripe.webhookSecret) missing.push('STRIPE_WEBHOOK_SECRET');
  if (config.dataBackend === 'firestore' && !config.gcpProject)
    missing.push('GCP_PROJECT');
  if (missing.length) {
    throw new Error(
      `Missing required production config: ${missing.join(', ')}`
    );
  }
}
