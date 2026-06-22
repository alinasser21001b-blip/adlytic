-- ════════════════════════════════════════════════════════════════════════
-- V6 Subscriptions — Phase 5.1
--
-- Adds: tier/status columns on workspaces, payment_events ledger,
--       processed_stripe_events idempotency table, and supporting enums.
--
-- Safe to apply to a live DB: all additions are new columns/tables/enums
-- with NULLable or DEFAULT-backed values. No existing rows are mutated.
-- The legacy `workspaces.plan` column is preserved untouched.
-- ════════════════════════════════════════════════════════════════════════

-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('FREE', 'PREMIUM');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('INACTIVE', 'ACTIVE', 'PAST_DUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('STRIPE_CARD', 'WHATSAPP_MANUAL');

-- CreateEnum
CREATE TYPE "PaymentEventType" AS ENUM ('ACTIVATED', 'RENEWED', 'CANCELED', 'EXPIRED', 'REFUNDED', 'UPGRADED', 'DOWNGRADED');

-- CreateEnum
CREATE TYPE "PaymentEventSource" AS ENUM ('STRIPE', 'WHATSAPP_MANUAL');

-- AlterTable
ALTER TABLE "workspaces"
  ADD COLUMN "tier"                    "SubscriptionTier"   NOT NULL DEFAULT 'FREE',
  ADD COLUMN "subscription_status"     "SubscriptionStatus" NOT NULL DEFAULT 'INACTIVE',
  ADD COLUMN "payment_method"          "PaymentMethod",
  ADD COLUMN "stripe_customer_id"      TEXT,
  ADD COLUMN "stripe_subscription_id"  TEXT,
  ADD COLUMN "subscription_expires_at" TIMESTAMP(3);

-- CreateIndex (unique constraints on Stripe ids — guard against double-mapping)
CREATE UNIQUE INDEX "workspaces_stripe_customer_id_key"     ON "workspaces"("stripe_customer_id");
CREATE UNIQUE INDEX "workspaces_stripe_subscription_id_key" ON "workspaces"("stripe_subscription_id");

-- CreateIndex (lookup paths for subscription queries + expiry cron)
CREATE INDEX "workspaces_subscription_status_idx"     ON "workspaces"("subscription_status");
CREATE INDEX "workspaces_subscription_expires_at_idx" ON "workspaces"("subscription_expires_at");

-- CreateTable: append-only payment ledger
CREATE TABLE "payment_events" (
    "id"           TEXT                 NOT NULL,
    "workspace_id" TEXT                 NOT NULL,
    "event_type"   "PaymentEventType"   NOT NULL,
    "source"       "PaymentEventSource" NOT NULL,
    "tier_after"   "SubscriptionTier",
    "note"         TEXT,
    "external_ref" TEXT,
    "amount_minor" BIGINT,
    "currency"     TEXT,
    "triggered_by" TEXT,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_events_workspace_id_created_at_idx" ON "payment_events"("workspace_id", "created_at");
CREATE INDEX "payment_events_source_idx"                  ON "payment_events"("source");

-- AddForeignKey
ALTER TABLE "payment_events"
  ADD CONSTRAINT "payment_events_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: Stripe webhook idempotency guard
-- PK is the Stripe event.id verbatim — atomic dedupe on INSERT collision.
CREATE TABLE "processed_stripe_events" (
    "id"           TEXT         NOT NULL,
    "type"         TEXT         NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_stripe_events_pkey" PRIMARY KEY ("id")
);
