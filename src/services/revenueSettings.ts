// ════════════════════════════════════════════════════════════════════════
//  src/services/revenueSettings.ts
//
//  Platform-owner revenue configuration: Premium display price + WhatsApp
//  support number. Stored in `platform_settings`; env vars remain fallbacks
//  for Stripe price IDs and an unset WhatsApp number.
// ════════════════════════════════════════════════════════════════════════

import type { PrismaClient } from '@prisma/client';

export const REVENUE_KEYS = {
  premiumPriceAmount: 'premium_price_amount',
  premiumPriceCurrency: 'premium_price_currency',
  premiumPricePeriod: 'premium_price_period',
  supportWhatsappNumber: 'support_whatsapp_number',
} as const;

export interface RevenueSettings {
  /** Display price in major units (e.g. 10 for $10). */
  premiumPriceAmount: number;
  premiumPriceCurrency: string;
  /** Billing period label, e.g. "month". */
  premiumPricePeriod: string;
  /** E.164 or digits; null when neither DB nor env is set. */
  supportWhatsappNumber: string | null;
  /** True when STRIPE_PREMIUM_PRICE_ID is configured (read-only). */
  stripeConfigured: boolean;
  /** True when a WhatsApp number is available from DB or env. */
  whatsappConfigured: boolean;
}

export interface RevenueSettingsUpdate {
  premiumPriceAmount?: number;
  premiumPriceCurrency?: string;
  premiumPricePeriod?: string;
  supportWhatsappNumber?: string | null;
}

const DEFAULTS = {
  premiumPriceAmount: 10,
  premiumPriceCurrency: 'USD',
  premiumPricePeriod: 'month',
} as const;

function mapFromRows(rows: { key: string; value: string }[]): Map<string, string> {
  return new Map(rows.map((r) => [r.key, r.value]));
}

function parseAmount(raw: string | undefined): number {
  if (raw == null || raw.trim() === '') return DEFAULTS.premiumPriceAmount;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULTS.premiumPriceAmount;
  return Math.round(n * 100) / 100;
}

function envWhatsapp(): string | null {
  const raw = process.env['SUPPORT_WHATSAPP_NUMBER'];
  if (!raw || !raw.trim()) return null;
  return raw.trim();
}

export function formatPremiumCta(settings: Pick<RevenueSettings, 'premiumPriceAmount' | 'premiumPriceCurrency' | 'premiumPricePeriod'>): string {
  const amount = settings.premiumPriceAmount;
  const currency = (settings.premiumPriceCurrency || 'USD').toUpperCase();
  const period = settings.premiumPricePeriod === 'year' ? 'year' : 'month';
  const periodAr = period === 'year' ? 'سنة' : 'شهر';
  let priceLabel: string;
  try {
    priceLabel = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    priceLabel = `${amount} ${currency}`;
  }
  return `الترقية إلى Premium — ${priceLabel} / ${periodAr}`;
}

export async function getRevenueSettings(prisma: PrismaClient): Promise<RevenueSettings> {
  const rows = await prisma.platformSetting.findMany({
    where: { key: { in: Object.values(REVENUE_KEYS) } },
  });
  const map = mapFromRows(rows);
  const dbWa = map.get(REVENUE_KEYS.supportWhatsappNumber)?.trim() || null;
  const wa = dbWa || envWhatsapp();
  return {
    premiumPriceAmount: parseAmount(map.get(REVENUE_KEYS.premiumPriceAmount)),
    premiumPriceCurrency: (map.get(REVENUE_KEYS.premiumPriceCurrency) || DEFAULTS.premiumPriceCurrency).toUpperCase(),
    premiumPricePeriod: map.get(REVENUE_KEYS.premiumPricePeriod) === 'year' ? 'year' : 'month',
    supportWhatsappNumber: wa,
    stripeConfigured: Boolean(process.env['STRIPE_PREMIUM_PRICE_ID']?.trim()),
    whatsappConfigured: Boolean(wa),
  };
}

export async function updateRevenueSettings(
  prisma: PrismaClient,
  input: RevenueSettingsUpdate,
  updatedBy?: string,
): Promise<RevenueSettings> {
  const ops: { key: string; value: string }[] = [];

  if (input.premiumPriceAmount !== undefined) {
    const n = Number(input.premiumPriceAmount);
    if (!Number.isFinite(n) || n < 0 || n > 100_000) {
      throw new Error('premiumPriceAmount must be between 0 and 100000');
    }
    ops.push({ key: REVENUE_KEYS.premiumPriceAmount, value: String(Math.round(n * 100) / 100) });
  }
  if (input.premiumPriceCurrency !== undefined) {
    const cur = String(input.premiumPriceCurrency).trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(cur)) throw new Error('premiumPriceCurrency must be a 3-letter ISO code');
    ops.push({ key: REVENUE_KEYS.premiumPriceCurrency, value: cur });
  }
  if (input.premiumPricePeriod !== undefined) {
    const p = input.premiumPricePeriod === 'year' ? 'year' : 'month';
    ops.push({ key: REVENUE_KEYS.premiumPricePeriod, value: p });
  }
  if (input.supportWhatsappNumber !== undefined) {
    const raw = input.supportWhatsappNumber;
    if (raw == null || String(raw).trim() === '') {
      ops.push({ key: REVENUE_KEYS.supportWhatsappNumber, value: '' });
    } else {
      const digits = String(raw).replace(/\D/g, '');
      if (digits.length < 8) throw new Error('supportWhatsappNumber appears malformed');
      ops.push({ key: REVENUE_KEYS.supportWhatsappNumber, value: String(raw).trim() });
    }
  }

  if (ops.length) {
    await prisma.$transaction(
      ops.map((row) =>
        prisma.platformSetting.upsert({
          where: { key: row.key },
          create: { key: row.key, value: row.value, updatedBy: updatedBy ?? null },
          update: { value: row.value, updatedBy: updatedBy ?? null },
        }),
      ),
    );
  }

  return getRevenueSettings(prisma);
}

/**
 * Prefer DB WhatsApp number; fall back to SUPPORT_WHATSAPP_NUMBER env.
 * Returns digits-only for wa.me, or null when unset.
 */
export async function resolveSupportWhatsappDigits(prisma: PrismaClient): Promise<string | null> {
  const settings = await getRevenueSettings(prisma);
  if (!settings.supportWhatsappNumber) return null;
  const digits = settings.supportWhatsappNumber.replace(/\D/g, '');
  return digits.length >= 8 ? digits : null;
}
