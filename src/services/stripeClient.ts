// ════════════════════════════════════════════════════════════════════════
//  src/services/stripeClient.ts
//
//  Lazy singleton wrapper around the official Stripe SDK.
//
//  Why lazy: the API service boots without Stripe configured in early
//  environments (smoke tests, local dev without billing). Module-level
//  `new Stripe(...)` would crash boot when STRIPE_SECRET_KEY is unset.
//  We defer construction to first call site and surface a typed error
//  the route can convert into a 503.
//
//  Why a wrapper: keeps the version pin in one place (`apiVersion`),
//  centralises the env-var read, and gives us a single seam for future
//  test injection (`__setStripeClientForTests`).
// ════════════════════════════════════════════════════════════════════════

import Stripe from 'stripe';

/** Pinned API version — keep aligned with installed SDK major. */
const STRIPE_API_VERSION = '2025-09-30.clover' as const;

let _stripe: Stripe | null = null;

/**
 * Returns the singleton Stripe client.
 * Throws `StripeNotConfiguredError` when STRIPE_SECRET_KEY is missing —
 * callers should catch and translate to a 503 (fail-closed for billing).
 */
export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env['STRIPE_SECRET_KEY'];
  if (!key || key.trim().length === 0) {
    throw new StripeNotConfiguredError();
  }
  _stripe = new Stripe(key, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    apiVersion: STRIPE_API_VERSION as any,
    typescript: true,
  });
  return _stripe;
}

/**
 * Returns the webhook signing secret used by `stripe.webhooks.constructEvent`.
 * Separate from STRIPE_SECRET_KEY because the same API key can be reused
 * across multiple webhook endpoints, each with its own signing secret.
 */
export function getStripeWebhookSecret(): string {
  const secret = process.env['STRIPE_WEBHOOK_SECRET'];
  if (!secret || secret.trim().length === 0) {
    throw new StripeNotConfiguredError('STRIPE_WEBHOOK_SECRET is not set');
  }
  return secret;
}

export class StripeNotConfiguredError extends Error {
  constructor(message = 'STRIPE_SECRET_KEY is not set') {
    super(message);
    this.name = 'StripeNotConfiguredError';
  }
}

/** Test-only: clear the cached client so the next getStripe() re-reads env. */
export function _resetStripeClientForTests(): void {
  _stripe = null;
}
