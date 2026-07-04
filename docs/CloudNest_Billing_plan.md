# CloudNest Billing System — FeatherPanel-Style Spec & Build Prompt

This document defines a complete, production-ready billing and resource
management system, modeled on FeatherPanel's billing modules. It's designed
to sit alongside `/docs/CloudNest_Master_Plan.md` — treat this as the
detailed spec for the wallet/voucher/billing phases (Phase 5 onward) of that
plan, with more granularity around subscriptions, referrals, and a resource
store than the master plan originally called for.

**Relationship to the master plan:** the master plan's Phase 5 covers wallet,
vouchers, and hourly/daily/monthly billing at a high level. This document
expands that into seven sub-modules with their own schemas, endpoints, and
jobs. If you're following the master plan's phase order, treat Phases 1–7
below as a detailed breakdown of master-plan Phase 5, to be tackled after
master-plan Phase 4 (customer VM lifecycle) is merged and verified.

---

## 1. Module Overview

### 1.1 BillingCore (Foundation)

Central billing engine — manages user credit balances, billing profiles,
currencies, and invoices. All other modules depend on it.

**User features:**
- View credit balance and manage billing profile
- List and view invoice details

**Admin features:**
- Manage user credits (add, remove, set)
- Search users and view statistics
- Currency settings (default currency, available currencies list)
- Credits mode: `currency` (paid hosting) or `token` (freemium), with a
  tokens-per-currency rate
- Billing profiles (admin and per-user billing info)
- Invoice management — create, edit, delete invoices and line items
- Admin user widget showing credits, billing profile, and invoice history

### 1.2 BillingResources (Resource Pool Engine)

Gives users account-level resource pools (CPU, RAM, disk, servers,
databases, backups, allocations) and lets them split resources across
multiple servers. This is the same concept as `ResourcePool` /
`ResourceAllocation` in the master plan — this spec adds more granular
resource types (database slots, backup slots, allocation slots) than the
master plan's original CPU/RAM/disk/IPv4 model.

**User features:**
- Dashboard widget showing total vs. used vs. available resources
- Server configuration page to allocate/deallocate resources for a specific
  server (within account limits)

**Admin features:**
- View/search all users with resource allocations
- Set per-user resource limits
- Default and max resource templates (global settings)
- Statistics dashboard
- Admin user widget showing resource limits on the user edit page

### 1.3 BillingResourcesStore (Resource Store)

Lets users buy resource packages or individual resources using credits.

**User features:**
- Browse resource packages; purchase with credits
- Buy individual resources à la carte (CPU, RAM, disk, etc.)
- View purchase history; live credit balance from BillingCore

**Admin features:**
- Create/edit/delete resource packages (bundled limits + price in credits)
- Store settings — global discount, minimum purchase for discount, bulk
  discount tiers
- Individual store — per-resource unit pricing and purchase options

### 1.4 BillingResourcesNewServers (Server Creation)

Lets users create new servers using resources from their account pool.
This is the resource-pool-driven VM creation flow already covered in
master-plan Phase 3/4 — this spec formalizes the admin-side placement and
permission policies around it.

**User features:**
- Create-server page — choose OS/spell, resources, placement
  (location/node/realm), allocations
- Server created from available (unallocated) account resources

**Admin features:**
- Enable/configure self-service server creation
- Per-field policies for the create form — default, fixed, or hidden
  resource fields (CPU, RAM, disk, swap, IO, DB/backup/allocation limits)
- Placement policies — location, node, realm, OS template, with
  auto-select strategies (relevant once multi-node exists)
- New-server permissions — per-user permissions, permission groups,
  resource-level access (open/restricted per location, node, realm,
  template)

### 1.5 BillingPlans (Subscription Engine)

Sells servers as renewable billing plans with credit-based billing — a
full WHMCS-style subscription engine. This is additive to the master
plan's hourly/daily/monthly usage billing: plans are pre-packaged,
fixed-price subscriptions (like a DigitalOcean Droplet plan), whereas the
master plan's core billing engine handles metered usage on top of the
resource pool.

**User features:**
- Browse plans by category; view plan details
- Subscribe with credits; apply coupon codes at checkout
- Manage subscriptions: view, cancel, change plan
- Server provisioned automatically on subscribe (plan defines server config)

**Admin features:**
- Plan categories (CRUD)
- Plans CRUD — price in credits, billing period, server limits,
  template/realm/node placement, tax/extra charges, upgrade/downgrade
  paths, slider pricing
- Plan image upload
- Subscriptions management — list, edit, cancel, refund credits
- Plan coupons (separate from BillingRedeem's general redeem codes)
- Subscription lifecycle settings: suspend on failed renewal, grace
  period, auto-termination, unsuspend on renewal, cancellation rules,
  suspension/termination emails
- Optional: create a BillingCore invoice on purchase and renewal
- Stats dashboard; admin user widget for per-user subscriptions

### 1.6 BillingReferrals (Referral System)

Rewards users with credits for inviting new users to the platform.

**User features:**
- Personal referral code and shareable link
- Customize referral code (when admin allows custom codes)
- View referral usage stats and earnings history
- New users who register via a referral link earn referee credits;
  referrers earn referrer credits

**Admin features:**
- Enable/disable the referral system
- Configure referrer and referee credit amounts
- Default max uses per code (0 = unlimited)
- Referral cookie lifetime (days)
- Allow or disallow custom user codes
- View all referral codes and usage history, with search and pagination

### 1.7 BillingRedeem (Coupon/Redeem Codes)

Lets users redeem coupon codes for credits or billing-plan rewards. This
is the general-purpose voucher system from the master plan's spec, with
reward types expanded to cover plan trials and plan coupons in addition
to flat credits.

**User features:**
- Enter a code to redeem
- Reward types: flat credits, billing-plan trial (free period),
  billing-plan coupon (discount on initial, renewal, or both)
- View redemption history

**Admin features:**
- Enable/disable redeem system; allow multiple uses per user; default
  max uses
- Create/edit/delete codes — amount, expiry, max uses, reward type,
  linked plan, free-period days, discount percent/credits, coupon scope
- View code usage per code
- Plan-options endpoint (requires BillingPlans, for plan-linked codes)

---

## 2. System Integration Map

```
                    +------------------------------------------------------+
                    |                   BillingCore                        |
                    |  (Credits, Invoices, Currencies, Billing Profiles)   |
                    +---------------------------+---------------------------+
                                                 |
                    +---------------------------+---------------------------+
                    |                            |                           |
                    v                            v                           v
            +-----------------+         +-----------------+         +-----------------+
            | Billing         |         | Billing         |         | Billing         |
            | Resources       |<--------| Resources       |         | Plans           |
            | (Resource       |Provides | Store           |         | (Subscription   |
            |  Pools)         |limits & | (Purchase       |         |  Engine)        |
            +--------+--------+usage    |  packages)      |         +--------+--------+
                     |                  +-----------------+                   |
                     |                           |                            |
                     |                           v                            |
                     |                  +-----------------+                   |
                     +------------------+ Billing         +-------------------+
                                        | Resources        |
                                        | New Servers      |
                                        | (Server          |
                                        |  Creation)       |
                                        +-----------------+

            +-----------------+          +-----------------+
            | Billing         |          | Billing         |
            | Referrals       |--------->| Redeem          |
            | (Referral       |Both use  | (Coupon         |
            |  System)        |Core for  |  Codes)         |
            +-----------------+ credits  +-----------------+
```

**Integration details:**
- BillingCore provides credits, invoices, and currencies to all modules.
- BillingResources provides resource pools to NewServers and Store.
- BillingResourcesStore uses Core and Resources to add purchased
  resources to a user's pool.
- BillingResourcesNewServers uses Core and Resources for server creation.
- BillingPlans uses Core (optional invoices) and provisions servers via
  NewServers.
- BillingReferrals uses Core for credit rewards.
- BillingRedeem uses Core, and optionally BillingPlans, for plan-linked
  rewards.

---

## 3. Technology Stack (fixed — matches the master plan)

| Layer | Technology |
|---|---|
| Backend | NestJS + TypeScript |
| ORM | Prisma + PostgreSQL |
| Queue | Redis + BullMQ |
| Auth | JWT access token (short-lived) + httpOnly refresh token |
| Frontend | Next.js (App Router) + Tailwind |
| Realtime | Socket.IO (WebSocket) |
| Money | Integer minor units (cents) — never float |

## 4. Non-negotiable rules

1. **Audit logging:** every state-changing action writes to `AuditLog` in
   the same transaction as the action itself.
2. **Money:** stored as integer cents, never float.
3. **Idempotency:** all financial operations (credit adjustments, invoice
   creation, subscription renewals) are idempotent — safe to retry.
4. **Resource admission:** allocation checks happen inside the same DB
   transaction as the allocation write, never check-then-act across two
   queries.
5. **No placeholders:** never write `// TODO` or a mock implementation
   presented as done. If something can't be finished, say so explicitly.
6. **Testing:** every module needs unit tests and integration tests
   covering both the primary flow and the primary failure mode.

---

## 5. Database Schema

> Schema is written in Prisma-model shorthand. Field types map directly
> onto Prisma types (`String`, `Int`, `Boolean`, `DateTime`, `Json`);
> enums are named in `SCREAMING_CASE` and should be defined as actual
> Prisma `enum` blocks in the real schema file.

### 5.1 Core tables

```prisma
model User {
  id               String    @id @default(cuid())
  email            String    @unique
  passwordHash     String
  displayName      String?
  role             RoleEnum
  status           StatusEnum
  referralCode     String?   @unique
  referredByUserId String?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
}

enum RoleEnum {
  USER
  ADMIN
}

enum StatusEnum {
  ACTIVE
  SUSPENDED
  BANNED
}

model Session {
  id         String   @id @default(cuid())
  userId     String
  token      String   @unique
  expiresAt  DateTime
  userAgent  String?
  ipAddress  String?
  revoked    Boolean  @default(false)
}

model AuditLog {
  id           String   @id @default(cuid())
  userId       String
  action       String
  resourceType String
  resourceId   String?
  details      Json
  ipAddress    String?
  userAgent    String?
  createdAt    DateTime @default(now())
}

model Setting {
  id          String  @id @default(cuid())
  key         String  @unique
  value       Json
  description String?
}
```

### 5.2 BillingCore tables

```prisma
model CreditBalance {
  id        String   @id @default(cuid())
  userId    String   @unique
  balance   Int      // cents
  currency  String   @default("USD")
  updatedAt DateTime @updatedAt
}

model Transaction {
  id          String          @id @default(cuid())
  userId      String
  amount      Int             // can be negative; cents
  type        TransactionType
  description String
  referenceId String?         // invoiceId, subscriptionId, etc.
  metadata    Json?
  createdAt   DateTime        @default(now())
  // append-only: no update/delete exposed in the service layer
}

enum TransactionType {
  CREDIT
  DEBIT
  REFUND
  ADJUSTMENT
}

model Invoice {
  id            String        @id @default(cuid())
  userId        String
  invoiceNumber String        @unique
  status        InvoiceStatus
  total         Int           // cents
  tax           Int           // cents
  currency      String
  dueDate       DateTime
  paidAt        DateTime?
  createdAt     DateTime      @default(now())
}

enum InvoiceStatus {
  DRAFT
  SENT
  PAID
  CANCELLED
  OVERDUE
}

model InvoiceLineItem {
  id           String  @id @default(cuid())
  invoiceId    String
  description  String
  quantity     Int
  unitPrice    Int     // cents
  total        Int     // cents
  resourceType String?
  resourceId   String?
}

model BillingProfile {
  id                  String  @id @default(cuid())
  userId              String  @unique
  companyName         String?
  vatNumber           String?
  addressLine1        String?
  addressLine2        String?
  city                String?
  postalCode          String?
  country             String?
  phone               String?
  taxExempt           Boolean @default(false)
  taxExemptionReason  String?
}
```

### 5.3 BillingResources tables

```prisma
model ResourcePool {
  id              String @id @default(cuid())
  userId          String @unique
  cpuCores        Int
  memoryMb        Int
  diskGb          Int
  swapMb          Int
  ioWeight        Int
  serverSlots     Int
  databaseSlots   Int
  backupSlots     Int
  allocationSlots Int
  ipv4Count       Int
  ipv6Count       Int
}

model ResourceAllocation {
  id           String       @id @default(cuid())
  userId       String
  serverId     String?
  resourceType ResourceType
  allocated    Int
  used         Int?         // optional, for usage tracking
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt
}

enum ResourceType {
  CPU
  MEMORY
  DISK
  SWAP
  IO
  SERVER_SLOT
  DATABASE_SLOT
  BACKUP_SLOT
  ALLOCATION_SLOT
  IPV4
  IPV6
}

model ResourceTemplate {
  id              String  @id @default(cuid())
  name            String
  defaultCpuCores Int
  defaultMemoryMb Int
  defaultDiskGb   Int
  defaultSwapMb   Int
  defaultIoWeight Int
  maxCpuCores     Int
  maxMemoryMb     Int
  maxDiskGb       Int
  isActive        Boolean @default(true)
}
```

### 5.4 BillingResourcesStore tables

```prisma
model ResourcePackage {
  id              String  @id @default(cuid())
  name            String
  description     String?
  price           Int     // cents
  discountPrice   Int?    // cents
  cpuCores        Int
  memoryMb        Int
  diskGb          Int
  swapMb          Int
  ioWeight        Int
  serverSlots     Int
  databaseSlots   Int
  backupSlots     Int
  allocationSlots Int
  ipv4Count       Int
  ipv6Count       Int
  isActive        Boolean @default(true)
  sortOrder       Int
}

model StorePurchase {
  id              String         @id @default(cuid())
  userId          String
  packageId       String?
  resourceType    ResourceType?
  quantity        Int
  amount          Int            // cents
  discountApplied Int            // cents
  status          PurchaseStatus
  createdAt       DateTime       @default(now())
}

enum PurchaseStatus {
  PENDING
  COMPLETED
  FAILED
  REFUNDED
}

model StoreSetting {
  id                          String @id @default(cuid())
  globalDiscountPercent       Int
  minimumPurchaseForDiscount  Int    // cents
  bulkDiscountTier1Threshold  Int
  bulkDiscountTier1Percent    Int
  bulkDiscountTier2Threshold  Int
  bulkDiscountTier2Percent    Int
}

model IndividualStoreItem {
  id           String       @id @default(cuid())
  resourceType ResourceType
  unitPrice    Int          // cents
  minPurchase  Int
  maxPurchase  Int
  isActive     Boolean      @default(true)
}
```

### 5.5 BillingResourcesNewServers tables

```prisma
model ServerCreateSetting {
  id                 String   @id @default(cuid())
  isEnabled          Boolean
  fieldPolicies      Json     // default/fixed/hidden per resource field
  placementPolicies  Json     // location/node/realm/template auto-select
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
}

model ServerCreatePermission {
  id              String  @id @default(cuid())
  userId          String?
  permissionGroup String?
  locationAccess  Json
  nodeAccess      Json
  realmAccess     Json
  templateAccess  Json
  isRestricted    Boolean
}

model Server {
  id               String       @id @default(cuid())
  userId           String
  serverName       String
  serverIdentifier String       @unique
  location         String
  node             String
  realm            String
  template         String       // OS/cloud-init template
  status           ServerStatus
  cpuCores         Int
  memoryMb         Int
  diskGb           Int
  swapMb           Int
  ioWeight         Int
  ipv4Address      String?
  ipv6Address      String?
  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt
}

enum ServerStatus {
  PROVISIONING
  ACTIVE
  STOPPED
  SUSPENDED
  TERMINATED
}
```

> **Note:** `Server` here maps onto the master plan's `Vm` model. If you're
> implementing both documents against the same database, reconcile these
> into a single table rather than maintaining two parallel VM-like models.

### 5.6 BillingPlans tables

```prisma
model PlanCategory {
  id          String  @id @default(cuid())
  name        String
  description String?
  sortOrder   Int
  isActive    Boolean @default(true)
}

model BillingPlan {
  id             String        @id @default(cuid())
  categoryId     String?
  name           String
  description    String?
  price          Int           // cents
  billingPeriod  BillingPeriod
  cpuCores       Int
  memoryMb       Int
  diskGb         Int
  swapMb         Int
  ioWeight       Int
  serverSlots    Int
  location       String?
  node           String?
  realm          String?
  template       String?
  taxPercent     Int
  extraCharges   Json
  upgradePaths   Json          // plan IDs allowed to upgrade to
  downgradePaths Json          // plan IDs allowed to downgrade to
  sliderPricing  Json          // tiered pricing
  imageUrl       String?
  isActive       Boolean       @default(true)
  sortOrder      Int
}

enum BillingPeriod {
  MONTHLY
  QUARTERLY
  SEMI_ANNUALLY
  ANNUALLY
}

model Subscription {
  id                       String             @id @default(cuid())
  userId                   String
  planId                   String
  serverId                 String?
  status                   SubscriptionStatus
  startDate                DateTime
  nextRenewalDate          DateTime
  endDate                  DateTime?
  billingPeriod            BillingPeriod
  price                    Int                // cents
  couponApplied            String?
  discountAmount           Int                // cents
  autoRenew                Boolean            @default(true)
  gracePeriodEnd           DateTime?
  cancellationRequestedAt  DateTime?
  createdAt                DateTime           @default(now())
  updatedAt                DateTime           @updatedAt
}

enum SubscriptionStatus {
  ACTIVE
  PENDING
  CANCELLED
  SUSPENDED
  EXPIRED
  TERMINATED
}

model SubscriptionLifecycleSetting {
  id                        String  @id @default(cuid())
  suspendOnFailedRenewal    Boolean
  gracePeriodDays           Int
  autoTerminateAfterGrace   Boolean
  unsuspendOnRenewal        Boolean
  cancellationRequiresNotice Boolean
  cancellationNoticeDays    Int
  suspensionEmailTemplate   String?
  terminationEmailTemplate  String?
}

model PlanCoupon {
  id             String       @id @default(cuid())
  code           String       @unique
  planId         String?
  discountType   DiscountType
  discountValue  Int
  maxUses        Int
  uses           Int          @default(0)
  expiresAt      DateTime?
  isActive       Boolean      @default(true)
  createdAt      DateTime     @default(now())
}

enum DiscountType {
  PERCENTAGE
  FIXED
}
```

### 5.7 BillingReferrals tables

```prisma
model ReferralCode {
  id        String   @id @default(cuid())
  userId    String   @unique
  code      String   @unique
  isCustom  Boolean
  uses      Int      @default(0)
  maxUses   Int      @default(0) // 0 = unlimited
  createdAt DateTime @default(now())
}

model ReferralEarning {
  id              String        @id @default(cuid())
  referrerId      String
  refereeId       String
  referrerCredit  Int           // cents
  refereeCredit   Int           // cents
  status          EarningStatus
  paidAt          DateTime?
  createdAt       DateTime      @default(now())
}

enum EarningStatus {
  PENDING
  PAID
  REVERSED
}

model ReferralSetting {
  id                    String  @id @default(cuid())
  isEnabled             Boolean
  referrerCreditAmount  Int     // cents
  refereeCreditAmount   Int     // cents
  defaultMaxUses        Int     // 0 = unlimited
  cookieLifetimeDays    Int
  allowCustomCodes      Boolean
}
```

### 5.8 BillingRedeem tables

```prisma
model RedeemCode {
  id               String      @id @default(cuid())
  code             String      @unique
  rewardType       RewardType
  amount           Int?        // cents, for CREDITS type
  planId           String?
  freePeriodDays   Int?        // for PLAN_TRIAL
  discountPercent  Int?        // for PLAN_COUPON
  discountAmount   Int?        // cents, for PLAN_COUPON
  couponScope      CouponScope
  maxUses          Int
  uses             Int         @default(0)
  perUserMaxUses   Int         @default(1)
  expiresAt        DateTime?
  isActive         Boolean     @default(true)
  createdAt        DateTime    @default(now())
  updatedAt        DateTime    @updatedAt
}

enum RewardType {
  CREDITS
  PLAN_TRIAL
  PLAN_COUPON
}

enum CouponScope {
  INITIAL
  RENEWAL
  BOTH
}

model RedeemRedemption {
  id           String     @id @default(cuid())
  codeId       String
  userId       String
  rewardType   RewardType
  rewardValue  Int        // cents
  planId       String?
  redeemedAt   DateTime   @default(now())
  expiresAt    DateTime?  // for trial subscriptions
}
```

---

## 6. Module Structure, Endpoints & Jobs

### Phase 1 — BillingCore

**Endpoints:**
```
POST   /auth/register
POST   /auth/login
POST   /auth/refresh
POST   /auth/logout
GET    /auth/me

GET    /billing/balance
GET    /billing/transactions
POST   /billing/transactions                (admin only)
GET    /billing/invoices
GET    /billing/invoices/:id
POST   /billing/invoices                    (admin only)
PUT    /billing/invoices/:id                (admin only)
DELETE /billing/invoices/:id                (admin only)
GET    /billing/profile
PUT    /billing/profile
GET    /billing/settings/currencies         (admin only)
PUT    /billing/settings/currencies         (admin only)
GET    /billing/settings/credits-mode       (admin only)
PUT    /billing/settings/credits-mode       (admin only)

GET    /admin/users                         (with credit balance)
PUT    /admin/users/:id/credits             (add/remove/set)
GET    /admin/audit-logs                    (filterable: userId, action, resourceType, dateRange)
```

**Jobs:** none — Phase 1 operations are synchronous.

### Phase 2 — BillingResources

**Endpoints:**
```
GET    /resources/pool                      (user's resource pool)
GET    /resources/usage                     (total vs used vs available)
PUT    /resources/pool                      (admin only — set limits)
GET    /resources/templates                 (global defaults)
POST   /resources/templates                 (admin only)
PUT    /resources/templates/:id             (admin only)
DELETE /resources/templates/:id             (admin only)

GET    /admin/resources/users               (list with allocations)
GET    /admin/resources/user/:id            (detailed allocations)
PUT    /admin/resources/user/:id/limits
GET    /admin/resources/stats

POST   /servers/:serverId/resources/allocate
POST   /servers/:serverId/resources/deallocate
GET    /servers/:serverId/resources
```

**Jobs:** none — resource checks are synchronous, transaction-scoped.

### Phase 3 — BillingResourcesStore

**Endpoints:**
```
GET    /store/packages
GET    /store/packages/:id
POST   /store/packages                      (admin only)
PUT    /store/packages/:id                  (admin only)
DELETE /store/packages/:id                  (admin only)

GET    /store/individual-items
POST   /store/individual-items              (admin only)
PUT    /store/individual-items/:id          (admin only)
DELETE /store/individual-items/:id          (admin only)

POST   /store/purchase-package
POST   /store/purchase-individual
GET    /store/purchase-history

GET    /store/settings                      (admin only)
PUT    /store/settings                      (admin only)
```

**Jobs:**
- `ProcessStorePurchaseJob` — validates credits, deducts, adds resources
  to the pool, creates a transaction. Idempotency key derived from the
  purchase request ID.

### Phase 4 — BillingResourcesNewServers

**Endpoints:**
```
GET    /servers/create-form                 (returns field config)
POST   /servers                             (create server)
GET    /servers
GET    /servers/:id
DELETE /servers/:id
POST   /servers/:id/start
POST   /servers/:id/stop
POST   /servers/:id/restart
POST   /servers/:id/reinstall
POST   /servers/:id/resize

GET    /admin/servers                       (filters: status, node, user, search)
POST   /admin/servers/bulk-action           (start/stop/restart/delete)

GET    /admin/new-server/settings           (admin only)
PUT    /admin/new-server/settings           (admin only)
GET    /admin/new-server/permissions        (admin only)
PUT    /admin/new-server/permissions        (admin only)
```

**Jobs:**
- `CreateServerJob` — checks resource pool inside the allocation
  transaction, provisions the server via the Proxmox integration layer,
  allocates resources. On failure, rolls back the allocation and marks
  the server `TERMINATED` with a reason.

### Phase 5 — BillingPlans

**Endpoints:**
```
GET    /plans/categories
GET    /plans
GET    /plans/:id
POST   /plans                               (admin only)
PUT    /plans/:id                           (admin only)
DELETE /plans/:id                           (admin only)
POST   /plans/categories                    (admin only)
PUT    /plans/categories/:id                (admin only)
DELETE /plans/categories/:id                (admin only)

POST   /subscriptions                       (subscribe to plan)
GET    /subscriptions
GET    /subscriptions/:id
PUT    /subscriptions/:id                   (change plan)
DELETE /subscriptions/:id                   (cancel)
POST   /subscriptions/:id/renew
GET    /subscriptions/:id/invoices

GET    /admin/plans                         (admin only — full list with stats)
GET    /admin/subscriptions                 (admin only)
PUT    /admin/subscriptions/:id             (admin only)
POST   /admin/subscriptions/:id/cancel      (admin only)
POST   /admin/subscriptions/:id/refund      (admin only)

GET    /admin/plan-coupons                  (admin only)
POST   /admin/plan-coupons                  (admin only)
PUT    /admin/plan-coupons/:id              (admin only)
DELETE /admin/plan-coupons/:id              (admin only)

GET    /admin/lifecycle-settings            (admin only)
PUT    /admin/lifecycle-settings            (admin only)
```

**Jobs:**
- `ProcessSubscriptionRenewalJob` (repeatable) — checks wallet balance,
  renews or suspends per lifecycle settings.
- `ProvisionSubscriptionServerJob` — creates a server when a subscription
  is activated.
- `SubscriptionLifecycleJob` — handles grace period, suspension,
  termination transitions.

### Phase 6 — BillingReferrals

**Endpoints:**
```
GET    /referrals/code                      (user's referral code)
PUT    /referrals/code                      (customize code, if allowed)
GET    /referrals/stats
GET    /referrals/earnings

GET    /admin/referrals/settings            (admin only)
PUT    /admin/referrals/settings            (admin only)
GET    /admin/referrals/codes               (with search/pagination)
GET    /admin/referrals/usage
```

**Jobs:**
- `ProcessReferralRewardJob` — triggered on registration via a referral
  link; credits referrer and referee. Must verify: not a self-referral,
  referee wasn't already referred, code hasn't exceeded `maxUses`.

### Phase 7 — BillingRedeem

**Endpoints:**
```
POST   /redeem                              (redeem a code)
GET    /redeem/history
GET    /redeem/validate/:code               (check if code is valid)

GET    /admin/redeem/settings               (admin only)
PUT    /admin/redeem/settings               (admin only)
GET    /admin/redeem/codes                  (admin only)
POST   /admin/redeem/codes                  (admin only)
PUT    /admin/redeem/codes/:id              (admin only)
DELETE /admin/redeem/codes/:id              (admin only)
GET    /admin/redeem/codes/:id/usage        (admin only)
GET    /admin/redeem/plan-options           (requires BillingPlans)
```

**Jobs:**
- `ProcessRedeemJob` — validates code, applies reward (credits, trial,
  or coupon) inside a single transaction.

---

## 7. Integration Points (critical)

**1. Credit balance (BillingCore → all modules).** Every module that
adds/removes credits must call
`CreditService.adjustBalance(userId, amount, reason, metadata)`, which:
- Creates a `Transaction` row
- Updates `CreditBalance`
- Logs to `AuditLog`
- All inside a single DB transaction

**2. Resource pool (BillingResources → Store & NewServers).**
- Store: on package purchase, call `ResourceService.addToPool(userId, resources)`.
- NewServers: on server creation, call
  `ResourceService.allocate(userId, serverId, resources)` inside a
  transaction. If allocation fails, roll back the entire server creation
  — never leave a half-provisioned server with no matching allocation.

**3. Subscription → server provisioning (BillingPlans → NewServers).**
When a subscription activates:
1. Create a server using the plan's configuration.
2. Associate the server with the subscription.
3. If server creation fails, refund the subscription and mark it as
   failed — don't leave the customer charged with nothing provisioned.

**4. Redeem → Plans (BillingRedeem → BillingPlans).** When a code with
`PLAN_TRIAL` or `PLAN_COUPON` is redeemed:
- Apply the trial/coupon to the user's subscription or next invoice.
- If the code is plan-specific, validate the plan exists via the
  BillingPlans service before applying.

**5. Referral → registration flow.** When a user registers with a
referral code:
1. Store `referredByUserId` on the new user.
2. Enqueue `ProcessReferralRewardJob` to credit both parties.
3. The job re-validates eligibility at execution time, not just at
   enqueue time (state may have changed between the two).

---

## 8. Security & Hardening Requirements

- [ ] Rate limiting on login, redeem, and store-purchase endpoints
- [ ] JWT access token (short-lived) + httpOnly refresh token
- [ ] All admin endpoints protected by a `@Roles('ADMIN')` guard
- [ ] Webhook signature verification for any payment gateway added later
- [ ] API key scoping for automation (granular permissions per key)
- [ ] SQL injection protection (Prisma parameterizes by default — audit
      any raw queries specifically)
- [ ] Audit logging for every state-changing action
- [ ] Idempotency keys for all financial operations

---

## 9. Definition of Done

The system is complete when:

1. A user can register, log in, and view their credit balance.
2. An admin can adjust a user's credits and see the transaction in the
   audit log.
3. A user can purchase a resource package and see their resource pool
   increase.
4. A user can create a server using their account resources.
5. An admin can create a billing plan, and a user can subscribe to it,
   triggering automatic server provisioning.
6. A user can refer another user and both receive credits.
7. A user can redeem a coupon code for credits, a plan trial, or a plan
   discount.
8. All modules pass integration tests for primary flows and failure
   modes.
9. All endpoints have Swagger documentation.
10. Every state-changing action is logged in `AuditLog`.

---

## 10. Testing Requirements

- **Unit tests:** all services (`CreditService`, `ResourceService`,
  `PlanService`, etc.)
- **Integration tests:**
  - Full credit adjustment → transaction → invoice flow
  - Resource pool admission under concurrency (two simultaneous
    allocations against a pool with room for one)
  - Subscription renewal with insufficient funds
  - Referral reward on registration
  - Redeem code for each of the three reward types
- **End-to-end tests:** critical user journeys — purchase → create
  server → subscribe → refer → redeem, run as one continuous flow.

---

## 11. Frontend Pages (Next.js)

**User-facing:**
```
/dashboard                 — resource usage widget, credit balance, recent transactions
/billing                   — credit balance, transactions, invoices list
/billing/invoices/:id      — invoice detail
/billing/profile           — billing profile
/store                     — resource packages and individual items
/store/history             — purchase history
/servers                   — server list
/servers/create            — create-server form (dynamic fields per admin settings)
/servers/:id                — server detail
/plans                     — browse billing plans
/subscriptions             — manage subscriptions
/referrals                 — referral code and earnings
/redeem                    — redeem coupon codes
/settings                  — profile, security, etc.
```

**Admin-facing:**
```
/admin/dashboard           — stats overview
/admin/users               — user list with search and credit management
/admin/users/:id           — user detail: wallet, resources, subscriptions, invoices
/admin/resources           — resource pool management
/admin/store               — package and individual item management
/admin/servers             — server list with filters and bulk actions
/admin/plans               — plan and category management
/admin/subscriptions       — subscription management
/admin/referrals           — referral settings and code list
/admin/redeem              — redeem code management
/admin/audit-logs          — searchable audit log viewer
```

---

## 12. Implementation Order

1. **Phase 1:** BillingCore (auth, credits, invoices, audit logs)
2. **Phase 2:** BillingResources (resource pools, allocations)
3. **Phase 3:** BillingResourcesStore (package/individual purchases)
4. **Phase 4:** BillingResourcesNewServers (server creation)
5. **Phase 5:** BillingPlans (subscriptions, automated provisioning)
6. **Phase 6:** BillingReferrals (referral system)
7. **Phase 7:** BillingRedeem (coupon codes)
8. **Phase 8:** Frontend integration and polish
9. **Phase 9:** Hardening, testing, and deployment readiness

Do not skip ahead — each phase depends on the previous one's tables and
services existing and being tested.

---

## 13. Notes for the coding agent

- Start with Phase 1 and build sequentially; do not jump ahead.
- Write tests for each module before moving to the next.
- Use the exact schemas in section 5 — do not invent alternate field
  names or types.
- Follow the integration map in section 7 — modules communicate via
  well-defined service interfaces, not direct cross-module DB queries.
- All credit adjustments go through `CreditService.adjustBalance()`.
- All resource changes go through `ResourceService`, with admission
  control enforced at the transaction level.
- No placeholder code. If something can't be finished in the current
  session, say so explicitly and stop rather than faking completion.

---

## 14. Build prompt (paste into OpenCode)

Use this as the launch prompt once you reach this module in your phase
sequence. It assumes `AGENTS.md` (per `CloudNest_Master_Plan.md` section 3)
is already in place and the earlier master-plan phases (auth, Proxmox
integration, resource pool, VM lifecycle) are merged.

```
Read /docs/CloudNest_Master_Plan.md, /docs/CloudNest_Billing_System.md, and
AGENTS.md in full before doing anything.

Build the BillingCore module as defined in CloudNest_Billing_System.md
sections 5.1, 6 (Phase 1), 8, and 9. Use the exact schema from section 5.1.
Implement every endpoint listed under "Phase 1 — BillingCore" in section 6.

Do not implement BillingResources, Store, NewServers, Plans, Referrals, or
Redeem yet — those are later phases and out of scope for this session.

Definition of Done for this phase:
- A user can register, log in, and view their credit balance
- An admin can adjust a user's credits and see the transaction in the
  audit log
- Every credit adjustment goes through CreditService.adjustBalance() and
  is logged to AuditLog in the same transaction
- Unit tests on CreditService, integration test on the full credit
  adjustment -> transaction -> audit log flow
- Swagger docs updated for all new endpoints

Show me test output before declaring this phase done. When finished, stop
and wait for confirmation before starting BillingResources.
```

Repeat this pattern for each subsequent phase (2 through 7), referencing
the matching section number and Phase heading from section 6, and pasting
the corresponding piece of the Definition of Done from section 9.