# Agent Handoff: Iraqi Store Builder with Adlytic Inside

> **ملاحظة للمالك:** هذا الملف مكتوب بالإنجليزية لأنه موجَّه إلى وكيل برمجي، والدقة في أسماء الملفات والأوامر والمخطط أهم من لغة العرض. كل واجهات المنتج نفسها تبقى عربية أولاً كما يفرض المستودع.

| Item | Value |
|---|---|
| Version | 1.0 |
| Date | 2026-10-19 |
| Repository | `alinasser21001b-blip/adlytic` |
| Base for this work | `main`, plus the two reference documents listed in §2, which live on branch `claude/adlytic-code-usage-x2a5te` |
| Scope of this handoff | Build **Phase 0** end to end. Phases 1 to 3 are described for orientation only. |
| Owner | Ali Nasser (repository owner) |

---

## 0. How to use this document

1. Read §1 to §5 completely before writing any code.
2. Do the preflight in §6 and stop if any check fails.
3. Build milestones M0 to M7 in §9 in order. Each milestone has tasks, files, acceptance criteria and tests.
4. After every milestone: run the checks in §11, commit, push, and append to `docs/handoff/PROGRESS.md` using the format in §12.
5. If you hit anything listed in §13 (decisions the owner has not made) or anything gated in §4.3, stop that item, record it in `PROGRESS.md` under "Blocked", and continue with work that does not depend on it.

---

## 1. Product in one page

**What we are building.** A multi-tenant store builder for Iraqi merchants, comparable to Shopify, where every store has Adlytic (our existing Meta Ads intelligence product) built in. A merchant who sells on Instagram and WhatsApp today gets a branded Arabic storefront on a platform subdomain, a product catalogue, an order inbox, and ads measurement that ties Meta spend to orders that were actually delivered.

**Why it can win.** Research (see §2) established three facts:

- Shopify does not work for Iraqi merchants: Shopify Payments and PayPal are unavailable, and the core has no cash-on-delivery operations, Iraqi address model, phone-first identity or Arabic default.
- Iraqi competitors (Rozenama, Dokani, Mel IQ, StoreIQ, Shariki) are cheap and Arabic, but none has an order-confirmation workflow, courier cash reconciliation, a public API or ads measurement.
- Iraqi e-commerce is roughly 80 to 98 percent cash on delivery, and refusal at the door is reported between 19 and 40 percent. The metric merchants actually need is **cost per delivered order**, which neither Meta nor any competitor can compute. We can, because we own both the order and the ad data.

**Strategy.** Copy Shopify's public contracts (data model shapes, theme architecture, webhook and scope naming, versioned APIs), build the cash-on-delivery operations layer on top, and put Adlytic in the centre.

**Phase 0 goal (this handoff).** A "WhatsApp catalogue" storefront that fits how Iraqi merchants already sell. The customer browses an Arabic storefront, places an order with phone and address, the platform creates a real order with a number, and the customer is sent to WhatsApp with a prefilled message. The merchant manages orders in an Arabic dashboard. Meta Pixel fires with order-level event IDs, and attribution (UTM, fbclid) is stored on every order.

**Phase 0 exit gate (business, not code).** 50 real stores receiving real orders. Do not start Phase 1 work unless the owner says so.

---

## 2. Required reading

Read these before coding. Section numbers refer to the documents themselves.

| Document | Where | What to take from it |
|---|---|---|
| `docs/research/IRAQI_SHOPIFY_REVERSE_ENGINEERING.md` | branch `claude/adlytic-code-usage-x2a5te` (fetch it if your base lacks it) | Executive summary; §2.2 Shopify data model and theme contract; §2.3 Liquid safety model; §5 Iraqi couriers, payments, Meta surface; §6 gap matrix; **§7.1 technical decisions**; **§7.2 code reuse audit**; **§7.3 data model and COD state machine**; **§8 Adlytic-inside design**; §9 phases and effort; §10 risks; §11.4 items still unverified |
| `docs/feasibility/IRAQ_MASS_MARKET_ADS_FEASIBILITY.md` | same branch | Market, pricing in IQD (rate 1,520 IQD per USD), payment rails, Meta constraints |
| `.claude/skills/adlytic-audit/SKILL.md` | repo | **Binding invariants** for this codebase: authorisation, Arabic/RTL, design tokens, token crypto, Meta read-only, recurring defect patterns |
| `prisma/schema.prisma` | repo | Existing models; conventions (cuid ids, `@map` snake_case, `@@map` plural table names) |
| `src/api/server.ts` lines ~510 to ~860 | repo | App construction (`buildRoutes`), security headers (~L577), `adminPage()` (~L673), `getUserId()` (~L738), `checkMember()` (~L755), session cookie helpers (~L824, ~L843) |
| `test_route_authz.ts`, `test_tenant_isolation.ts` | repo | How authorisation and isolation are enforced; you will extend both patterns |

Fetch the reference docs if missing:

```bash
git fetch origin claude/adlytic-code-usage-x2a5te
git checkout origin/claude/adlytic-code-usage-x2a5te -- docs/research docs/feasibility
```

---

## 3. Current state of the repository

**Stack (as built).** Node 22+, TypeScript strict, Hono 4.12 on `@hono/node-server`, Prisma 7.8 with `@prisma/adapter-pg`, PostgreSQL, Redis via ioredis, BullMQ 5.79, Railway (api and worker roles via `SERVICE_ROLE`), zod 4. No React, no bundler: pages are server-rendered HTML from TypeScript template literals. Tests are standalone `tsx` or `node` scripts at the repo root, run by name; there is no jest/vitest.

**Key commands.**

```bash
npm ci
npx prisma generate
npm run typecheck                 # tsc --noEmit
npm run start:dev                 # local server, needs .env
npm run db:migrate                # prisma migrate dev (local DB only)
npx tsx test_route_authz.ts
npx tsx test_tenant_isolation.ts
node test_page_scripts.mjs        # page script parse + design-system gates
node test_no_english_in_ar_pages.mjs
npm run test:all                  # full suite, what CI runs
npm run test:e2e                  # Playwright
```

CI (`.github/workflows/test.yml`) runs `npm ci`, `prisma generate`, `typecheck`, Playwright install, then `npm run test:all`. Anything you add to `test:all` runs in CI.

**What already exists that Phase 0 reuses** (full audit in study §7.2):

| Need | Reuse | Mode |
|---|---|---|
| Merchant login, sessions | `src/services/jwtAuth.ts`, session cookie helpers and `getUserId()` in `server.ts`, `User` model | as-is |
| Platform admin gate | `src/api/adminGuard.ts`, `adminPage()` | as-is |
| Queues and Redis | `src/lib/queue.ts`, `src/lib/redis.ts`, `src/lib/advisoryLock.ts` | as-is, add queues |
| Arabic design system | `src/ui/tokens.ts`, `src/web/layout.ts` (`layout()`, `TOKENS_CSS`), self-hosted fonts in `public/fonts` | as-is for admin pages |
| WhatsApp deep links | `src/services/whatsappLink.ts` (`buildWhatsappLink`) | modify: per-store number, order message |
| Secret encryption | `src/services/tokenEncryption.ts` | as-is (only if you store a secret; Phase 0 should not need it) |
| Manual IQD billing ledger | `PaymentEvent` model, `WHATSAPP_MANUAL` flow, `src/services/subscriptionService.ts` | as-is; do not change in Phase 0 |
| State machine primitive | `platform/packages/domain/src/shared/machine.ts` (`defineMachine`, `transition`, `can`) | copy into `src/commerce/domain/machine.ts` with a header comment naming the source (it is ~60 lines; the `platform/` workspace has its own tooling and is not importable cleanly) |
| Arabic text normaliser | `dawai-platform/server/services/sku-key.ts` (`normalizeSkuKey`) | port into `src/commerce/lib/arabicKey.ts` |
| Idempotency and rate limit | `dawai-platform/server/security/idempotency.ts`, `rate-limit.ts` | port semantics to Prisma |
| Image sanitising and object store | `dawai-platform/server/storage/object-store.ts`, `encrypted-files.ts` (sanitiser part only) | port; product images are public and unencrypted |
| Storefront UX reference | `pharmacy/` (static WhatsApp catalogue) | pattern only: keep data shape and conversion UX; **drop English copy, LTR, emoji images and the fabricated reviews and ratings** |
| Baghdad districts | `hub/js/data.js` (`DISTRICTS`, from ~L65) | port as suggestions only; check accuracy |
| Arabic plural and RTL helpers | `platform/packages/design/src/arabic.ts`, `rtl.ts` | port if needed |

**What does not exist anywhere** (you build it): cart and checkout, commerce order machine, storefront rendering, host-based store resolution, theme engine, public multi-tenant media, Meta Pixel snippet injection, attribution capture, store-scoped authorisation.

---

## 4. Rules you must follow

### 4.1 Repository invariants (from `adlytic-audit` skill; violating one is a defect)

- **Authorisation is per route.** `app.use('/api/*')` is an active-user gate, not an auth gate. Every handler resolves its caller. Every store-scoped handler proves membership. Public routes are listed with a reason.
- **HTML pages cannot read bearer tokens.** Page gating uses the HttpOnly `adlytic_session` cookie.
- **Arabic first.** `<html lang="ar" dir="rtl">`. The server-rendered default is Arabic; no English markup swapped by JS. Dates `ar-u-nu-latn` (Arabic months, Latin digits). Do not mix numeral systems on one screen.
- **Design tokens live once** in `layout.ts` `:root`. Admin pages link `TOKENS_CSS`; never redeclare tokens.
- **Template-literal hazard.** A stray backtick or `${` inside browser JS embedded in a TS template literal compiles and breaks the page at runtime. This has happened seven times. Run `node test_page_scripts.mjs` before every commit touching a page file.
- **Money:** never invent a currency or minor-unit scale. IQD is stored as integer dinars (no minor units).
- **Meta API is read-only.** Phase 0 makes no Meta API calls at all; the Pixel is a browser script the merchant configures.
- **Reproduce before fixing; a test that never went red is decoration.** For each new fitness test, first prove it fails on the defect it guards.
- Do not reset, stash, revert or delete other people's work.

### 4.2 Product rules for this project

- Phone is the customer's identity. Normalise Iraqi mobiles to E.164 (`+9647XXXXXXXXX`). Accept `07XXXXXXXXX`, `7XXXXXXXXX`, `+964...`, `00964...`, and Arabic-Indic digits.
- Address is Iraqi: governorate (select), district or area (text with suggestions), nearest landmark (required), optional details. No postal code.
- Prices are integer IQD. Display with Latin digits, comma thousands separator, suffix `د.ع` (example `25,000 د.ع`).
- Never trust client prices or totals. The server recomputes every line from the database.
- No fabricated reviews, ratings, sales counts or "X people viewing" in any theme.
- Every store-owned table has `storeId` and every query filters by it.
- Storefronts must work without JavaScript for the core path (view product, order one item). JavaScript adds the multi-item cart.

### 4.3 Approval scope

By handing you this document, the owner approves **only** the following gated changes:

1. New Prisma models and enums listed in §7, delivered as additive migrations. The only change allowed to existing models is adding back-relation fields to `User` and `Workspace`.
2. New dependencies: `liquidjs` (pin `10.30.0`), and `sharp` for image renditions **only if** the Docker image builds with it (see M3). Nothing else without asking.
3. A Host-based dispatch in `src/api/serve.ts` that sends storefront hostnames to a separate Hono app (see §8.2). No other change to `serve.ts` or to the main app's security headers.
4. Extending `test_route_authz.ts` and adding new test scripts, and adding them to `test:all`.

Still gated (ask first): any change to token crypto, existing auth behaviour, analytics semantics or `insightMapper.ts`, the Meta API client, Stripe/billing logic, destructive or data-rewriting migrations, `prisma migrate reset` against anything but a disposable local database, deployment configuration on Railway, DNS.

### 4.4 Git

- Work on the branch your session assigns. If none, create `feat/store-builder-phase-0` from `main`. Never push to `main`.
- One commit per coherent step; messages say what and why. Push after every milestone.
- Do not open a pull request unless the owner asks.

---

## 5. Architecture for Phase 0

```
                  ┌───────────────────────────── serve.ts ─────────────────────────────┐
 Host header ───► │ storefront host? ──yes──► storefrontApp (new Hono app, own headers)│
                  │        │no                                                         │
                  │        └──────────────► main app (existing Adlytic + /store admin) │
                  └─────────────────────────────────────────────────────────────────────┘
                                   │                         │
                                   ▼                         ▼
                           Prisma / Postgres  ◄──── store-scoped repositories (storeId everywhere)
                                   │
                               Redis (optional): compiled-template invalidation, page cache flag
```

**Directory layout (new code only):**

```
src/commerce/
  domain/
    machine.ts              # copied defineMachine primitive
    orderMachines.ts        # confirmation, fulfilment, cash machines (§7.3)
    money.ts                # IQD format/parse, integer math
    phone.ts                # Iraqi phone normalisation
    governorates.ts         # fixed list with Arabic labels
    refusalCodes.ts
  lib/
    arabicKey.ts            # ported normaliser for search/handles
    handles.ts              # slug/handle generation (Arabic → safe handle)
    idempotency.ts          # Prisma port
    rateLimit.ts            # Prisma port
    objectStore.ts          # ported S3-compatible + local volume adapter
    images.ts               # sanitise + renditions
  repositories/             # every function takes storeId as first argument
    stores.ts products.ts collections.ts customers.ts orders.ts media.ts
  services/
    checkout.ts             # cart validation, totals, order creation (transaction)
    orderActions.ts         # merchant actions → machine transitions → OrderEvent
    attribution.ts          # cookie parse, fbc derivation
    whatsappOrder.ts        # Arabic order message + wa.me link
  admin/
    api.ts                  # Hono sub-router mounted at /api/store
    pages.ts                # Hono sub-router for /store/* SSR pages
    guard.ts                # requireStoreAccess(), storePage()
    views/                  # page renderers using layout()
  storefront/
    app.ts                  # createStorefrontApp()
    resolveStore.ts         # Host → store
    headers.ts              # storefront security headers
    liquid.ts               # hardened LiquidJS engine + filters
    drops.ts                # DTO mappers (never pass Prisma rows to templates)
    routes.ts               # /, /collections/:h, /products/:h, /cart, /checkout, /orders/:token
  themes/
    whatsapp-catalog/       # theme #1 (Online Store 2.0 directory contract)
      layout/theme.liquid
      templates/index.json product.json collection.json cart.json checkout.json order.json 404.json
      sections/*.liquid
      snippets/*.liquid
      assets/theme.css theme.js
      locales/ar.json
      config/settings_schema.json settings_data.json
```

Merchant admin lives in the **main app** (same origin as Adlytic, so the Adlytic dashboard can later be linked same-origin). Mount it with two lines in `server.ts` (`app.route('/api/store', storeApi)` and `app.route('/store', storePages)`); put no handlers in `server.ts` itself.

---

## 6. Preflight (M0 starts here)

Run and record the output in `PROGRESS.md`:

```bash
node -v                      # must be >= 22
npm ci && npx prisma generate
npm run typecheck            # must be clean before you start
npx tsx test_route_authz.ts
npx tsx test_tenant_isolation.ts
node test_page_scripts.mjs
```

If typecheck or these tests fail on the untouched base, stop and report; do not build on a red base.

Local database: use a disposable Postgres (Docker or local). Never point `db:migrate` or `db:reset` at a shared or production database.

Create `docs/handoff/PROGRESS.md` and `docs/handoff/DECISIONS.md` (record every default you apply from §13).

---

## 7. Data model for Phase 0

### 7.1 Prisma additions

Follow existing conventions: `String @id @default(cuid())`, camelCase fields with `@map("snake_case")`, `@@map("plural_table")`, `createdAt`/`updatedAt` mapped. Every store-owned model has `storeId` with an index whose leading column is `storeId`.

```prisma
// ── Store tenancy ────────────────────────────────────────────────────────
model Store {
  id               String        @id @default(cuid())
  /// Subdomain label and public identifier. ^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$
  handle           String        @unique
  name             String
  status           StoreStatus   @default(DRAFT)
  currency         String        @default("IQD")
  defaultLocale    Locale        @default(AR)
  /// E.164, +9647XXXXXXXXX. Orders are sent to this WhatsApp number.
  whatsappNumber   String        @map("whatsapp_number")
  /// Optional link to an Adlytic workspace (Adlytic inside).
  workspaceId      String?       @unique @map("workspace_id")
  themeKey         String        @default("whatsapp-catalog") @map("theme_key")
  /// settings_data for the active theme (colours, logo media id, texts).
  themeSettings    Json          @default("{}") @map("theme_settings")
  /// { "baghdad": 5000, "default": 5000, "freeOverIqd": null }
  shippingSettings Json          @default("{}") @map("shipping_settings")
  /// Next human-facing order number; incremented inside the order transaction.
  nextOrderNumber  Int           @default(1001) @map("next_order_number")
  createdAt        DateTime      @default(now()) @map("created_at")
  updatedAt        DateTime      @updatedAt @map("updated_at")

  workspace        Workspace?    @relation(fields: [workspaceId], references: [id], onDelete: SetNull)
  members          StoreMember[]
  domains          StoreDomain[]
  products         Product[]
  variants         ProductVariant[]
  collections      Collection[]
  collectionItems  CollectionProduct[]
  media            MediaAsset[]
  customers        Customer[]
  orders           Order[]
  orderLines       OrderLine[]
  orderEvents      OrderEvent[]
  pixelConfig      StorePixelConfig?

  @@index([status])
  @@map("stores")
}

enum StoreStatus {
  DRAFT
  ACTIVE
  SUSPENDED
}

model StoreMember {
  id        String    @id @default(cuid())
  storeId   String    @map("store_id")
  userId    String    @map("user_id")
  role      StoreRole @default(OWNER)
  createdAt DateTime  @default(now()) @map("created_at")
  store     Store     @relation(fields: [storeId], references: [id], onDelete: Cascade)
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([storeId, userId])
  @@index([userId])
  @@map("store_members")
}

/// Capability is derived from role in code (src/commerce/admin/guard.ts),
/// using Shopify-style scope names (read_products, write_orders, ...).
enum StoreRole {
  OWNER
  MANAGER
  ORDERS_STAFF
  VIEWER
}

model StoreDomain {
  id        String            @id @default(cuid())
  storeId   String            @map("store_id")
  hostname  String            @unique
  kind      StoreDomainKind   @default(SUBDOMAIN)
  status    StoreDomainStatus @default(ACTIVE)
  isPrimary Boolean           @default(true) @map("is_primary")
  createdAt DateTime          @default(now()) @map("created_at")
  store     Store             @relation(fields: [storeId], references: [id], onDelete: Cascade)

  @@index([storeId])
  @@map("store_domains")
}

enum StoreDomainKind {
  SUBDOMAIN
  CUSTOM
}

enum StoreDomainStatus {
  PENDING_DNS
  ACTIVE
  DISABLED
}

// ── Catalogue ────────────────────────────────────────────────────────────
model Product {
  id          String        @id @default(cuid())
  storeId     String        @map("store_id")
  handle      String
  title       String
  /// Plain text with line breaks; rendered escaped. No raw HTML in Phase 0.
  description String        @default("")
  status      ProductStatus @default(DRAFT)
  productType String?       @map("product_type")
  vendor      String?
  tags        String[]      @default([])
  /// Up to 3 options, Shopify-style: [{ "name": "اللون", "values": ["أحمر","أسود"] }]
  options     Json          @default("[]")
  /// normalizeSkuKey(title) for search and duplicate detection.
  searchKey   String        @default("") @map("search_key")
  createdAt   DateTime      @default(now()) @map("created_at")
  updatedAt   DateTime      @updatedAt @map("updated_at")
  deletedAt   DateTime?     @map("deleted_at")

  store       Store               @relation(fields: [storeId], references: [id], onDelete: Cascade)
  variants    ProductVariant[]
  media       MediaAsset[]
  collections CollectionProduct[]

  @@unique([storeId, handle])
  @@index([storeId, status])
  @@map("products")
}

enum ProductStatus {
  DRAFT
  ACTIVE
  ARCHIVED
}

model ProductVariant {
  id                String          @id @default(cuid())
  storeId           String          @map("store_id")
  productId         String          @map("product_id")
  title             String          @default("Default")
  option1           String?
  option2           String?
  option3           String?
  priceIqd          Int             @map("price_iqd")
  compareAtPriceIqd Int?            @map("compare_at_price_iqd")
  sku               String?
  /// null = not tracked.
  inventoryQuantity Int?            @map("inventory_quantity")
  inventoryPolicy   InventoryPolicy @default(DENY) @map("inventory_policy")
  position          Int             @default(0)
  mediaId           String?         @map("media_id")
  createdAt         DateTime        @default(now()) @map("created_at")
  updatedAt         DateTime        @updatedAt @map("updated_at")

  store   Store   @relation(fields: [storeId], references: [id], onDelete: Cascade)
  product Product @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@index([storeId, productId])
  @@map("product_variants")
}

enum InventoryPolicy {
  DENY
  CONTINUE
}

model Collection {
  id          String              @id @default(cuid())
  storeId     String              @map("store_id")
  handle      String
  title       String
  description String              @default("")
  position    Int                 @default(0)
  createdAt   DateTime            @default(now()) @map("created_at")
  updatedAt   DateTime            @updatedAt @map("updated_at")
  store       Store               @relation(fields: [storeId], references: [id], onDelete: Cascade)
  products    CollectionProduct[]

  @@unique([storeId, handle])
  @@map("collections")
}

model CollectionProduct {
  id           String     @id @default(cuid())
  storeId      String     @map("store_id")
  collectionId String     @map("collection_id")
  productId    String     @map("product_id")
  position     Int        @default(0)
  store        Store      @relation(fields: [storeId], references: [id], onDelete: Cascade)
  collection   Collection @relation(fields: [collectionId], references: [id], onDelete: Cascade)
  product      Product    @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@unique([collectionId, productId])
  @@index([storeId])
  @@map("collection_products")
}

model MediaAsset {
  id        String   @id @default(cuid())
  storeId   String   @map("store_id")
  productId String?  @map("product_id")
  /// Object key prefix: stores/{storeId}/media/{id}; renditions suffixed -320.webp etc.
  objectKey String   @map("object_key")
  mime      String
  width     Int
  height    Int
  bytes     Int
  alt       String   @default("")
  position  Int      @default(0)
  /// e.g. [320, 640, 1280] when renditions exist; [] when only the original exists.
  renditions Int[]   @default([])
  createdAt DateTime @default(now()) @map("created_at")
  store     Store    @relation(fields: [storeId], references: [id], onDelete: Cascade)
  product   Product? @relation(fields: [productId], references: [id], onDelete: SetNull)

  @@index([storeId, productId])
  @@map("media_assets")
}

// ── Customers and orders ─────────────────────────────────────────────────
model Customer {
  id            String   @id @default(cuid())
  storeId       String   @map("store_id")
  /// E.164 +9647XXXXXXXXX
  phone         String
  name          String
  whatsappOptIn Boolean  @default(false) @map("whatsapp_opt_in")
  ordersCount   Int      @default(0) @map("orders_count")
  refusedCount  Int      @default(0) @map("refused_count")
  note          String   @default("")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")
  store         Store    @relation(fields: [storeId], references: [id], onDelete: Cascade)
  orders        Order[]

  @@unique([storeId, phone])
  @@map("customers")
}

model Order {
  id                 String                  @id @default(cuid())
  storeId            String                  @map("store_id")
  number             Int
  /// 32-byte random, base64url. Used for the customer's order status page.
  publicToken        String                  @unique @map("public_token")
  customerId         String                  @map("customer_id")
  channel            OrderChannel            @default(STOREFRONT_WHATSAPP)
  confirmationStatus ConfirmationStatus      @default(PENDING) @map("confirmation_status")
  fulfillmentStatus  FulfillmentStatus       @default(UNFULFILLED) @map("fulfillment_status")
  cashStatus         CashStatus              @default(COD_DUE) @map("cash_status")
  refusalCode        RefusalCode?            @map("refusal_code")

  subtotalIqd        Int                     @map("subtotal_iqd")
  shippingIqd        Int                     @map("shipping_iqd")
  totalIqd           Int                     @map("total_iqd")

  // Shipping address snapshot (never a foreign key to a mutable address).
  shipName           String                  @map("ship_name")
  shipPhone          String                  @map("ship_phone")
  shipGovernorate    String                  @map("ship_governorate")
  shipDistrict       String                  @map("ship_district")
  shipLandmark       String                  @map("ship_landmark")
  shipDetails        String                  @default("") @map("ship_details")
  customerNote       String                  @default("") @map("customer_note")

  // Attribution captured at checkout (study §8).
  utmSource          String?                 @map("utm_source")
  utmMedium          String?                 @map("utm_medium")
  utmCampaign        String?                 @map("utm_campaign")
  utmContent         String?                 @map("utm_content")
  utmTerm            String?                 @map("utm_term")
  fbclid             String?
  fbc                String?
  fbp                String?
  landingPath        String?                 @map("landing_path")
  referrer           String?
  /// Shared with the browser Pixel Purchase event for later CAPI dedup.
  pixelEventId       String                  @unique @map("pixel_event_id")
  idempotencyKey     String                  @map("idempotency_key")

  placedAt           DateTime                @default(now()) @map("placed_at")
  confirmedAt        DateTime?               @map("confirmed_at")
  handedToCourierAt  DateTime?               @map("handed_to_courier_at")
  deliveredAt        DateTime?               @map("delivered_at")
  returnedAt         DateTime?               @map("returned_at")
  cancelledAt        DateTime?               @map("cancelled_at")
  updatedAt          DateTime                @updatedAt @map("updated_at")

  store              Store                   @relation(fields: [storeId], references: [id], onDelete: Cascade)
  customer           Customer                @relation(fields: [customerId], references: [id])
  lines              OrderLine[]
  events             OrderEvent[]

  @@unique([storeId, number])
  @@unique([storeId, idempotencyKey])
  @@index([storeId, placedAt])
  @@index([storeId, confirmationStatus])
  @@index([storeId, fulfillmentStatus])
  @@map("orders")
}

enum OrderChannel {
  STOREFRONT_WHATSAPP
  STOREFRONT_DIRECT
  MANUAL
}

/// Full value sets from study §7.1.8; Phase 0 uses a subset (see §7.3).
enum ConfirmationStatus {
  PENDING
  ATTEMPTING
  CONFIRMED
  UNREACHABLE
  CUSTOMER_CANCELLED
  REJECTED_FRAUD
}

enum FulfillmentStatus {
  UNFULFILLED
  PACKED
  HANDED_TO_COURIER
  IN_TRANSIT
  OUT_FOR_DELIVERY
  DELIVERED
  RETURN_INITIATED
  RETURNED
  LOST
}

enum CashStatus {
  COD_DUE
  COLLECTED_BY_COURIER
  REMITTED
  SETTLED
  SHORTFALL_DISPUTED
  NOT_COLLECTED
}

enum RefusalCode {
  CUSTOMER_UNREACHABLE
  PRICE_REJECTED
  CHANGED_MIND
  WRONG_ADDRESS
  NOT_AS_DESCRIBED
  DAMAGED
  OTHER
}

model OrderLine {
  id                   String  @id @default(cuid())
  storeId              String  @map("store_id")
  orderId              String  @map("order_id")
  productId            String? @map("product_id")
  variantId            String? @map("variant_id")
  titleSnapshot        String  @map("title_snapshot")
  variantTitleSnapshot String  @default("") @map("variant_title_snapshot")
  sku                  String?
  unitPriceIqd         Int     @map("unit_price_iqd")
  quantity             Int
  lineTotalIqd         Int     @map("line_total_iqd")
  store                Store   @relation(fields: [storeId], references: [id], onDelete: Cascade)
  order                Order   @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([storeId, orderId])
  @@map("order_lines")
}

model OrderEvent {
  id        String         @id @default(cuid())
  storeId   String         @map("store_id")
  orderId   String         @map("order_id")
  axis      OrderAxis
  fromState String         @map("from_state")
  toState   String         @map("to_state")
  event     String
  actorType OrderActorType @map("actor_type")
  actorId   String?        @map("actor_id")
  note      String         @default("")
  createdAt DateTime       @default(now()) @map("created_at")
  store     Store          @relation(fields: [storeId], references: [id], onDelete: Cascade)
  order     Order          @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([storeId, orderId, createdAt])
  @@map("order_events")
}

enum OrderAxis {
  CONFIRMATION
  FULFILLMENT
  CASH
  CREATED
}

enum OrderActorType {
  MERCHANT
  CUSTOMER
  SYSTEM
  COURIER
}

// ── Marketing ────────────────────────────────────────────────────────────
model StorePixelConfig {
  id          String   @id @default(cuid())
  storeId     String   @unique @map("store_id")
  metaPixelId String?  @map("meta_pixel_id")
  enabled     Boolean  @default(false)
  updatedAt   DateTime @updatedAt @map("updated_at")
  store       Store    @relation(fields: [storeId], references: [id], onDelete: Cascade)

  @@map("store_pixel_configs")
}

// ── Abuse controls (ported from dawai semantics) ─────────────────────────
model CommerceRateLimit {
  key         String   @id
  count       Int
  windowStart DateTime @map("window_start")

  @@map("commerce_rate_limits")
}
```

Add back-relations: `User.storeMemberships StoreMember[]` and `Workspace.store Store?`.

### 7.2 Repository rule

Every repository function signature starts with `storeId: string`. Example: `getProductByHandle(storeId, handle)`, never `getProductByHandle(handle)`. Updates and deletes use `where: { id, storeId }` (via `updateMany`/`deleteMany` and a count check, or a prior scoped read), so an id from another store cannot be touched. This is the primary isolation guard; Postgres RLS is deferred to Phase 1 (study §7.1.4).

### 7.3 Order machines (Phase 0 subset)

Implement three machines with `defineMachine`. Each edge has a `bp` reference string pointing at `study §7.3` or `§7.1.8`.

**Confirmation** (initial `PENDING`):

| from | event | to | who |
|---|---|---|---|
| PENDING | `confirm` | CONFIRMED | merchant |
| PENDING | `mark_unreachable` | UNREACHABLE | merchant |
| UNREACHABLE | `confirm` | CONFIRMED | merchant |
| PENDING | `cancel_by_customer` | CUSTOMER_CANCELLED | merchant |
| UNREACHABLE | `cancel_by_customer` | CUSTOMER_CANCELLED | merchant |
| PENDING | `reject_fraud` | REJECTED_FRAUD | merchant |

**Fulfilment** (initial `UNFULFILLED`; any edge requires `confirmationStatus = CONFIRMED`, enforced in `orderActions.ts`):

| from | event | to |
|---|---|---|
| UNFULFILLED | `hand_to_courier` | HANDED_TO_COURIER |
| HANDED_TO_COURIER | `mark_delivered` | DELIVERED |
| HANDED_TO_COURIER | `mark_returned` | RETURNED (requires `refusalCode`) |

**Cash** (initial `COD_DUE`; edges are triggered by fulfilment, except settle):

| from | event | to | trigger |
|---|---|---|---|
| COD_DUE | `collected` | COLLECTED_BY_COURIER | automatically with `mark_delivered` |
| COD_DUE | `not_collected` | NOT_COLLECTED | automatically with `mark_returned` |
| COLLECTED_BY_COURIER | `settle` | SETTLED | merchant marks cash received |

Rules: every action runs in one Prisma transaction that reads the order with `storeId`, calls `transition()`, writes the new status and timestamp, writes an `OrderEvent` per changed axis, and updates `Customer.refusedCount` on `mark_returned`. An illegal transition returns HTTP 409 with an Arabic message and the machine refusal detail in the log. Unit-test every edge and at least five illegal ones.

### 7.4 Fixed reference data

`governorates.ts` exports this list (key → Arabic label): BAGHDAD بغداد, BASRA البصرة, NINEVEH نينوى, ERBIL أربيل, SULAYMANIYAH السليمانية, DUHOK دهوك, KIRKUK كركوك, DIYALA ديالى, ANBAR الأنبار, SALAHADDIN صلاح الدين, BABIL بابل, KARBALA كربلاء, NAJAF النجف, WASIT واسط, QADISIYAH القادسية, MUTHANNA المثنى, DHI_QAR ذي قار, MAYSAN ميسان, HALABJA حلبجة. Record in `DECISIONS.md` that Halabja's status should be confirmed by the owner. Store `shipGovernorate` as the key.

Shipping fee in Phase 0: `shippingSettings.baghdad` when governorate is BAGHDAD, else `shippingSettings.default`; free when subtotal ≥ `freeOverIqd` if set. Defaults when unset: 5,000 and 5,000 (study §5.1).

---

## 8. Cross-cutting designs

### 8.1 Authorisation for store routes

`src/commerce/admin/guard.ts`:

- `requireStoreAccess(c, storeId, capability)` resolves the user from the bearer token **or** the `adlytic_session` cookie (reuse the existing helpers; do not write a new token parser), loads `StoreMember` by `(storeId, userId)`, maps role to capabilities, and returns `{ userId, role }` or a 401/403 response.
- Role capabilities: OWNER all; MANAGER all except `write_store_settings` and member management; ORDERS_STAFF `read_products`, `read_orders`, `write_orders`; VIEWER `read_*`.
- `storePage(c, storeId, capability, render)` for SSR pages, mirroring `adminPage()`: missing cookie redirects to the existing login page with a return URL.
- Merchant must be an active Adlytic `User` (`isActive`), same rule as today.

Extend `test_route_authz.ts` (or add `test_commerce_authz.ts` and add it to `test:all`) so it parses `src/commerce/admin/api.ts` and `pages.ts` and fails when a handler neither calls `requireStoreAccess`/`storePage` nor appears in a public list with a reason. Prove it red first by adding a temporary unguarded route.

### 8.2 Storefront app and host dispatch

- New env vars, validated in `src/config.ts`: `STOREFRONT_ROOT_DOMAIN` (example `store.localhost` in dev; production value is an owner decision, §13), `OBJECT_STORE_*` (see M3), `PLATFORM_NAME` (display name; default `متجري` until the owner chooses).
- `serve.ts`: before handing the request to the main app, read `Host` (strip port, lowercase). If it equals `X.${STOREFRONT_ROOT_DOMAIN}` or matches an active `StoreDomain.hostname`, call `storefrontApp.fetch`. Otherwise the main app. Unknown subdomains of the storefront root return the storefront 404 page, never the Adlytic app. Cache host→storeId in-process for 60 seconds with negative caching; invalidate on store/domain update.
- Do not make the main app's storefront root a subdomain of the Adlytic apex domain. The main app sends `Strict-Transport-Security: ...; includeSubDomains; preload` (`server.ts` ~L587); storefronts need their own root domain.
- `src/commerce/storefront/headers.ts` sets storefront headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN`, HSTS without `preload` and without `includeSubDomains`, and a CSP:
  `default-src 'self'; script-src 'self' 'unsafe-inline' https://connect.facebook.net; img-src 'self' data: https:; connect-src 'self' https://www.facebook.com https://connect.facebook.net; style-src 'self' 'unsafe-inline'; font-src 'self' data:; frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self' https://wa.me https://api.whatsapp.com`.
  Verify the Pixel loads and fires under this CSP in Chromium; adjust only what is proven necessary.
- Local dev: `http://{handle}.store.localhost:PORT` resolves to loopback in Chromium. Document this in the README section you add.

### 8.3 Theme engine (LiquidJS, hardened)

Study §2.2.8, §2.3 and §7.1.2 give the reasoning. Phase 0 themes are written by us, not by merchants, but build the engine as if templates were untrusted, because Phase 2 opens them to merchants.

- `new Liquid({ ownPropertyOnly: true, strictFilters: true, strictVariables: false, lenientIf: true, outputEscape: 'escape', jsTruthy: false, parseLimit: 1_000_000, renderLimit: 500, memoryLimit: <tune>, templateLimit: <tune>, cache: true, fs: <custom loader> })`. **All limits default to unbounded in LiquidJS; set every one explicitly.**
- Custom file loader reads only from `src/commerce/themes/{themeKey}/` (resolved and checked against path traversal). Allow `render`; disallow `include` and `layout` tags inside sections and snippets (layout is applied by our renderer, not by templates).
- Templates are JSON (`templates/product.json`): `{ "sections": { "<id>": { "type": "<section file>", "settings": {...} } }, "order": ["<id>", ...] }`. The renderer renders each section in order with `section.settings` merged over defaults, then wraps the result in `layout/theme.liquid` via `content_for_layout`. Register a `{% schema %}` tag that renders nothing and whose JSON supplies setting defaults. Blocks and the editor are Phase 2; keep the JSON shape compatible with Shopify's so they slot in later.
- Drops (`drops.ts`) build plain objects from DTOs; never pass Prisma rows or class instances. Phase 0 globals: `shop` (name, handle, whatsapp, currency, locale, settings), `request` (path, host, page_type), `routes` (root_url, cart_url, checkout_url), `settings`, and per page `product`, `variant`, `collection`, `collections`, `products` (paginated, capped at 48), `cart`, `order` (status page only, via token).
- Filters: `money` (IQD, `25,000 د.ع`), `money_without_currency`, `image_url` (width param → nearest rendition, falls back to original), `asset_url` (theme asset with content hash), `t` (keys from `locales/ar.json`), `handleize`, `url_for_product`, `url_for_collection`, `json` (built-in), `date` (Asia/Baghdad, `ar-u-nu-latn`).
- Compiled templates are cached per `(themeKey, themeVersion)`; theme version is the git commit or a build hash.
- Fitness test `test_commerce_liquid_sandbox.ts` must prove: prototype access returns empty (`{{ product.constructor }}`, `{{ product.__proto__ }}`), unknown filters throw under strictFilters, output is HTML-escaped (`<script>` in a product title renders inert), `renderLimit` aborts an infinite-ish loop, a section cannot `include` an arbitrary path, and path traversal in the loader is refused.

**Theme #1 `whatsapp-catalog`:** port the conversion ideas of `pharmacy/` (category chips, search, product card, product page with sticky order button, floating WhatsApp bubble, related products, FAQ accordion, JSON-LD Product schema). Arabic RTL, mobile-first, no third-party fonts or CDNs (self-host fonts as the admin does), images lazy-loaded with `width`/`height`, total CSS under 60 KB and JS under 30 KB uncompressed. No fake reviews or ratings. Theme settings in `config/settings_schema.json`: primary colour, accent colour, logo (media id), announcement text, hero title and subtitle, show WhatsApp bubble (bool).

### 8.4 Checkout and order creation

Two entry points, same service:

1. **No-JS single item:** product page form `POST /checkout` with `variantId` and `quantity`, then the address form.
2. **JS cart:** cart held in `localStorage` (key per store handle), rendered on `/cart`, posted to `/checkout` as lines.

`POST /checkout/place` (form post, CSRF-safe via same-origin form and an origin check):

1. Rate-limit by `ip + storeId` (Postgres `CommerceRateLimit`, 10 per 10 minutes) and by `phone + storeId` (5 per hour). Over limit: Arabic error page, HTTP 429.
2. Validate with zod: name 2 to 60 chars, phone normalises to `+9647[3-9]XXXXXXXX` (13 digits after the plus sign), governorate key in list, district 2 to 60, landmark 3 to 120, details ≤ 300, note ≤ 500, 1 to 30 lines, quantity 1 to 20.
3. Idempotency: a hidden `idempotencyKey` (random, generated server-side when rendering the form). A repeat with the same key returns the existing order's confirmation page.
4. In one transaction: load variants by id **and** storeId with `ACTIVE` products; recompute unit prices and totals; enforce inventory when tracked and policy is DENY (decrement atomically with a conditional update); upsert `Customer` by `(storeId, phone)`; increment `Store.nextOrderNumber` with an atomic update and use the returned value; create `Order` (all three statuses at initial values, `pixelEventId` = random UUID, `publicToken` = 32 random bytes base64url), `OrderLine`s with snapshots, and an `OrderEvent` (`axis CREATED`, actor CUSTOMER); increment `Customer.ordersCount`.
5. Respond with the order confirmation page `/orders/{publicToken}`, which shows the order number, items, total and a large "أرسل الطلب عبر واتساب" button. If the store channel is WhatsApp, auto-redirect after 2 seconds with a visible fallback link.
6. The WhatsApp message (`whatsappOrder.ts`) is Arabic: store name, order number, each line `title × qty = price`, shipping, total, customer name, phone, governorate, district, landmark, and the status page URL. Build the link with `buildWhatsappLink` (extend it to accept a number argument instead of only the env number). Keep the message under 1,500 characters; truncate lines with "و N منتجات أخرى" if needed.

Never call `enqueueOrFallback` for anything order-critical; it silently runs work in-process when Redis is down. Phase 0 order creation is synchronous in the request.

### 8.5 Attribution and Pixel

- Storefront middleware: on any request with `utm_*` or `fbclid` query params, write a first-party cookie `_sa` (HttpOnly, SameSite=Lax, 30 days, JSON with utm fields, fbclid, landing path, referrer, timestamp). Last non-direct touch wins: a later visit with new params overwrites; a visit without params leaves it unchanged. Derive `fbc` as `fb.1.{unixMillis}.{fbclid}` when fbclid is present. Read `_fbp` if the Pixel set it.
- At checkout, copy `_sa`, `fbc`, `fbp` into the order.
- Pixel: when `StorePixelConfig.enabled` and `metaPixelId` matches `^\d{10,20}$`, inject the standard Meta Pixel base code in `layout/theme.liquid` via a snippet, and fire `PageView` on every page, `ViewContent` on product pages (`content_ids` = variant ids, `content_type: product`, `value`, `currency: 'IQD'`), `AddToCart` on add, `InitiateCheckout` on the address form, and `Purchase` on the order confirmation page **once** (guard with a `sessionStorage` flag keyed by order id) with `eventID: order.pixelEventId`, `value: totalIqd`, `currency: 'IQD'`.
- Before relying on `value` for optimisation, the owner must verify in Events Manager test events that IQD is accepted as a currency. Record this as an open item; do not convert currencies.
- No Conversions API in Phase 0. `pixelEventId` exists so Phase 1 CAPI can deduplicate.

### 8.6 Media

- Port the dawai object store as `objectStore.ts` with two drivers: local volume (`OBJECT_STORE_DRIVER=local`, `OBJECT_STORE_LOCAL_DIR`) and S3-compatible (`OBJECT_STORE_DRIVER=s3`, endpoint, bucket, region, access key, secret; Cloudflare R2 compatible). Keys are prefixed `stores/{storeId}/media/`.
- Upload: multipart POST to `/api/store/:storeId/media`, max 8 MB, magic-byte allowlist (JPEG, PNG, WebP), decode with a pixel limit, auto-rotate, strip metadata.
- Renditions 320, 640, 1280 WebP via `sharp`. Serve through the storefront app at `/media/{mediaId}-{w}.webp` with `Cache-Control: public, max-age=31536000, immutable`. In the local driver, stream from disk; in S3, proxy or redirect to a public bucket URL (decide by env; record in `DECISIONS.md`).
- If `sharp` does not build in the current Dockerfile, keep originals only (`renditions = []`), serve the original, record it as blocked, and continue.

### 8.7 Merchant admin pages (Arabic SSR, existing design system)

All under `/store`, rendered with `layout()` and `TOKENS_CSS`, Arabic, mobile-first, 44 px targets:

| Path | Purpose |
|---|---|
| `/store/new` | Onboarding: store name, handle (auto from name, editable, availability check), WhatsApp number, governorate. Creates `Store`, `StoreMember` OWNER, primary `StoreDomain` `{handle}.{STOREFRONT_ROOT_DOMAIN}`. |
| `/store/:storeId` | Home: today's and 7-day counts per confirmation and fulfilment status, store link with copy and WhatsApp share buttons, setup checklist (logo, 3 products, pixel, shipping fees). |
| `/store/:storeId/products` | List with search (uses `searchKey`), status filter, bulk publish/unpublish. |
| `/store/:storeId/products/new`, `/store/:storeId/products/:id` | Edit title, description, status, type, vendor, tags, up to 3 options with values, generated variant grid with price/compare/sku/stock, images upload and order, collections. |
| `/store/:storeId/collections` | Manual collections with ordering. |
| `/store/:storeId/orders` | Inbox: tabs for "بانتظار التأكيد", "مؤكَّد", "مع شركة التوصيل", "مُسلَّم", "مرتجع", "ملغى"; each row shows number, customer, governorate, total, age, source (utm_source or "مباشر"); one-tap actions allowed by the machine. |
| `/store/:storeId/orders/:id` | Detail: lines, address, attribution, timeline from `OrderEvent`, action buttons, a "اتصل بالعميل" `tel:` link and a "راسل على واتساب" link with a prefilled confirmation message. |
| `/store/:storeId/settings` | Name, WhatsApp, shipping fees, pixel id and toggle, theme settings, link to Adlytic workspace. |
| `/store/:storeId/reports/sources` | Orders by `utm_source`/`utm_campaign`/`utm_content` with counts per confirmation and fulfilment state, and delivered-rate per source. **Counts only; no spend join in Phase 0.** |

API endpoints mirror these under `/api/store/:storeId/...`, return JSON, and are what the pages' small inline scripts call. Use the error envelope style already in the app; messages in Arabic.

---

## 9. Milestones

Estimates are focused person-days for one senior TypeScript engineer, from study §9. A team of three can run M3, M4 and M5 in parallel after M2.

### M0 Preflight and records (0.5 day)

- Tasks: §6 preflight; create `PROGRESS.md` and `DECISIONS.md`; record every §13 default you are applying.
- Done when: base is green and both files are committed.

### M1 Data model and domain primitives (3 to 4 days)

- Tasks: add §7.1 models and enums; one additive migration `commerce_phase0_foundation`; `machine.ts` copy; `orderMachines.ts`; `money.ts`; `phone.ts`; `governorates.ts`; `refusalCodes.ts`; `arabicKey.ts`; `handles.ts`.
- Tests (new, added to `test:all`): `test_commerce_machine.ts` (every legal edge, ≥ 5 illegal edges, terminal states), `test_commerce_primitives.ts` (phone normalisation table of ≥ 15 cases including Arabic-Indic digits and invalid prefixes; IQD formatting; handle generation from Arabic names; governorate keys).
- Done when: `prisma migrate dev` applies cleanly on an empty DB and on a DB with existing Adlytic data; typecheck clean; tests green.

### M2 Store tenancy, auth and onboarding (4 to 5 days)

- Tasks: `repositories/stores.ts`; `guard.ts` (`requireStoreAccess`, `storePage`, role→capability map); `admin/api.ts` and `admin/pages.ts` sub-routers mounted in `server.ts` with two lines; `/store/new` onboarding; store home page; settings page (without theme and pixel sections yet); link-to-workspace option for users who already own a workspace (sets `Store.workspaceId` only if the user is OWNER of that workspace via `checkMember`).
- Tests: authz fitness test over the new routers (proved red first); `test_commerce_isolation.ts` following `test_tenant_isolation.ts`'s pattern (real Hono app via `buildRoutes`, fake or test Prisma): user A on store A → 200; user A on store B → 403 for every store API endpoint, including product, order and media ids belonging to store B passed under store A's path.
- Done when: a fresh user can register, create a store, and reach its home page; isolation and authz tests green.

### M3 Catalogue and media (8 to 10 days)

- Tasks: product, variant, collection repositories and API; variant grid generation from options (cartesian product, max 100 variants per product in Phase 0); product list and editor pages; collections page; `objectStore.ts`, `images.ts`, upload endpoint, rendition pipeline; Dockerfile check for `sharp` (`docker build .` locally if Docker is available; otherwise record that it is unverified).
- Tests: `test_commerce_catalog.ts` (handle uniqueness per store not global, variant regeneration keeps prices of unchanged combinations, cross-store ids rejected, soft delete hides from storefront); upload rejects a non-image with an image extension and an oversized file.
- Done when: a merchant can create a product with two options and images and see it in the admin list.

### M4 Storefront (10 to 12 days)

- Tasks: `serve.ts` host dispatch; `storefront/app.ts`, `resolveStore.ts`, `headers.ts`, `liquid.ts`, `drops.ts`, `routes.ts`; theme `whatsapp-catalog`; pages: home, collection, all products, product, search (`?q=` on `searchKey`), cart, 404; theme settings section in the admin settings page; `robots.txt`, `sitemap.xml` per store; canonical tags.
- Tests: `test_commerce_liquid_sandbox.ts` (§8.3); `test_commerce_storefront.ts` (host routing: store A host never renders store B's product even with B's handle; unknown subdomain → storefront 404; main-app host never serves storefront routes; drafts and archived products 404 on storefront; Arabic `lang`/`dir`; prices formatted per §4.2); extend `test_no_english_in_ar_pages.mjs` or add an equivalent check over rendered storefront pages.
- Performance check: product page HTML under 60 KB and first response under 300 ms locally with a warm template cache; record the numbers.
- Done when: `http://demo.store.localhost:PORT` shows the store with products on a 360 px wide viewport in Chromium, screenshot attached in `PROGRESS.md`.

### M5 Checkout, orders and merchant inbox (8 to 10 days)

- Tasks: `services/checkout.ts`, `lib/idempotency.ts`, `lib/rateLimit.ts`, `services/whatsappOrder.ts`, `services/orderActions.ts`; storefront `/checkout`, `/checkout/place`, `/orders/:token`; admin orders inbox and detail pages; customer list on the order detail (orders count, refused count).
- Tests: `test_commerce_checkout.ts`: client-tampered price ignored; inactive or other-store variant rejected; inventory DENY prevents oversell under two concurrent requests; idempotent repeat returns the same order; order numbers unique and sequential per store under concurrency; rate limit triggers; WhatsApp message contains number, total and status link and stays under limit. `test_commerce_order_actions.ts`: every action through the API writes the right `OrderEvent`s and timestamps; illegal action → 409; fulfilment action before confirmation → 409; `mark_returned` without refusal code → 400 and increments `refusedCount` with one.
- Done when: an order placed on the storefront appears in the inbox and can be walked to DELIVERED and SETTLED, and another to RETURNED with a reason.

### M6 Pixel, attribution and source report (4 to 5 days)

- Tasks: `services/attribution.ts` and storefront middleware; Pixel snippet and events per §8.5; pixel settings in admin; `/store/:storeId/reports/sources`.
- Tests: `test_commerce_attribution.ts` (cookie set on params, last non-direct touch overwrite rule, fbc format, values land on the order); a Playwright check that the Purchase event fires once with `eventID` equal to the order's `pixelEventId` (intercept `connect.facebook.net` and `facebook.com/tr` requests; do not hit Meta).
- Done when: an order placed from `?utm_source=facebook&utm_campaign=test&fbclid=abc` shows those values in the order detail and in the sources report.

### M7 Hardening, e2e and documentation (5 to 6 days)

- Tasks: Playwright e2e `e2e/store-builder.spec.ts`: register → create store → add product with image → open storefront host → order via no-JS path → order via cart path → merchant confirms → hands to courier → delivered → settled; and a second order returned with a reason. Add all new test scripts to `package.json` and `test:all`. Run the full suite. Write `docs/handoff/PHASE0_OPERATIONS.md` (env vars, local dev with `*.store.localhost`, how to create a pilot merchant, known limitations). Update the repo README with one short section linking to it.
- Deployment preparation (do not deploy): list exactly what Railway and DNS need (wildcard DNS for the storefront root to the app, whether Railway accepts a wildcard custom domain on the current plan or Cloudflare must front it, object storage bucket, env vars). Verify Railway wildcard support from current Railway docs; if you cannot, say so.
- Done when: `npm run typecheck` and `npm run test:all` are green locally, the e2e passes, and the operations doc exists.

**Phase 0 total:** about 43 to 53 person-days solo (roughly 9 to 11 weeks), or 4 to 5 weeks for a team of three.

---

## 10. Phases after Phase 0 (orientation only; do not start without the owner)

| Phase | Scope | Study reference |
|---|---|---|
| 1. Full COD store | Native checkout without WhatsApp hop; phone OTP via WhatsApp-first then SMS (local provider, 80 to 250 IQD per SMS); confirmation queue with WhatsApp utility templates (Iraq rate 0.0079 USD) and scheduled retries; first courier adapter behind `CourierAdapter` with Excel export/import fallback; `Shipment`, `ShipmentEvent`, `Remittance`, `RemittanceLine`; one wallet (ZainCash v2 or FIB) for subscriptions and optional prepay; custom domains via Cloudflare for SaaS; Postgres RLS as defence in depth; transactional outbox feeding BullMQ; Conversions API with `pixelEventId` dedup (needs explicit owner approval because it writes to Meta); first "cost per confirmed order" card joining Adlytic spend, built inside the analytics architecture rules | §5.1, §5.2, §7.1.3, §7.1.4, §7.1.7, §7.1.8, §7.3, §8 |
| 2. Platform | Theme editor (sections and blocks, Section Rendering API equivalent), merchant-editable themes, Kurdish locale, Meta catalogue feeds, WhatsApp Business Platform inbound and templates, more couriers, outbound webhooks with HMAC and quarterly API versions, app tokens, discounts | §2.2, §2.4, §7.1.2, §8 |
| 3. Differentiation | Live per-store feasibility study (margin × confirmation rate × delivery rate × CAC), in-dashboard boost after Meta `ads_management` Full access, cross-store refuser suppression network (opt-in), simple POS | §8, §2.4 |

---

## 11. Checks before every commit

```bash
npm run typecheck
node test_page_scripts.mjs                 # if any page or theme file changed
node test_no_english_in_ar_pages.mjs       # if any Arabic page changed
npx tsx test_route_authz.ts
npx tsx test_tenant_isolation.ts
npx tsx test_commerce_*.ts                 # every commerce test you have so far
```

Before every push, also run `npm run test:all`. Re-read your diff for: unscoped queries (any `prisma.<storeModel>.find*` or `update` without `storeId`), floats in money math, English strings in Arabic pages, backticks inside template-literal JS, secrets in code, and `enqueueOrFallback` on order paths.

---

## 12. Progress reporting

Append to `docs/handoff/PROGRESS.md` after each milestone:

```markdown
## M<n> <title> — <date>
- Commits: <short hashes>
- Built: <bullets>
- Tests added: <names> — all green (paste the summary lines)
- Measured: <page sizes, timings, screenshots paths>
- Deviations from handoff: <what and why, or "none">
- Blocked / needs owner: <items, or "none">
```

When you finish Phase 0 or stop, the last entry states what works end to end, what does not, and the exact next step.

---

## 13. Decisions the owner has not made, and the defaults you apply

Apply the default, record it in `DECISIONS.md`, and keep going. None of these blocks local development.

| # | Decision | Default for Phase 0 | Who resolves |
|---|---|---|---|
| D1 | Team size (solo or three) | Plan as solo; milestones are sequential | Owner |
| D2 | Where the platform lives | Inside this repo under `src/commerce/`, same deployable and database as Adlytic | Owner may move it later |
| D3 | Canonical auth stack (Adlytic JWT/cookie vs dawai sessions) | Adlytic's existing auth for merchants; dawai patterns ported only for idempotency and rate limiting | Owner |
| D4 | Merchant identity | Existing email/password `User` plus store WhatsApp number; phone OTP in Phase 1 | Owner |
| D5 | Production storefront root domain | Env var only; dev uses `store.localhost`. Must not be a subdomain of the Adlytic apex | Owner buys/assigns domain |
| D6 | Platform brand name | `PLATFORM_NAME` env, default `متجري` | Owner |
| D7 | Object storage | Local volume in dev; S3-compatible (R2) driver ready for production | Owner provides bucket |
| D8 | Merchant activation | New stores start `DRAFT`; a store becomes `ACTIVE` when the owner's `User.isActive` is true and the merchant publishes. Reuse the existing manual WhatsApp activation for users | Owner |
| D9 | Pricing and plan limits | No billing changes in Phase 0; soft limits in config: 200 products, 8 images per product, 100 variants per product, 500 orders per day per store | Owner |
| D10 | Halabja as 19th governorate | Included | Owner confirms |
| D11 | IQD accepted by Meta Pixel `currency` | Send `IQD`; flag for verification | Owner verifies in Events Manager |

---

## 14. Known risks and traps

- **Unscoped query.** The most likely serious defect. Every repository takes `storeId` first, and isolation tests cover every endpoint.
- **Route added without a guard.** The authz fitness test must cover the new routers before you add the second route.
- **Template-literal breakage** in admin pages. Run `test_page_scripts.mjs`.
- **HSTS includeSubDomains** on the Adlytic origin would force HTTPS on every merchant subdomain if the storefront root were under it. Keep the roots separate.
- **CSP:** the main app blocks third-party scripts by design; only the storefront app allows the Pixel.
- **LiquidJS limits default to unbounded.** Set them; prove them with tests.
- **Order numbers under concurrency.** Use an atomic increment inside the transaction; test with parallel requests.
- **Inventory oversell.** Conditional decrement (`WHERE inventory_quantity >= qty`) and check the affected row count.
- **Silent queue fallback** (`enqueueOrFallback`). Not on order paths.
- **sharp in Docker.** Verify or fall back to originals.
- **Pharmacy reference contains fabricated reviews and ratings.** Do not port them.
- **Courier APIs do not exist publicly in Iraq** (study §5.1). Nothing in Phase 0 depends on them; do not start courier work.
- **Meta.** No API calls in Phase 0. Shops checkout is unavailable for Iraq and Meta blocked Commerce Order Management endpoints in Graph API v26.0 (study §2.4); never plan on reading orders from Meta.

---

## 15. Definition of done for Phase 0

1. A new user can register, create a store, add products with options and images, set WhatsApp number, shipping fees, theme colours and logo, and Pixel ID, all in Arabic.
2. The store is reachable at `{handle}.{STOREFRONT_ROOT_DOMAIN}`, renders in Arabic RTL, works without JavaScript for a single-item order, and with JavaScript for a multi-item cart.
3. Orders are created server-side with recomputed totals, sequential per-store numbers, idempotency, rate limits and attribution, and the customer is handed to WhatsApp with a complete Arabic message and a status link.
4. The merchant inbox shows orders by state and allows only machine-legal actions, each recorded in the timeline.
5. Pixel events fire with the order's event id on Purchase, once.
6. The sources report shows orders and delivered rate by UTM source, campaign and content.
7. Isolation, authz, sandbox, checkout, order-action, attribution and e2e tests exist, were proven red where they guard a defect, and pass in `npm run test:all`.
8. `PROGRESS.md`, `DECISIONS.md` and `PHASE0_OPERATIONS.md` are complete and pushed.
