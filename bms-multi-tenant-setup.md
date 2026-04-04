# BMS Multi-Tenant Setup Plan

> Working document for migrating the FitFuel BMS from single-tenant to a full multi-tenant SaaS platform with super admin control and a template system.

---

## Vision

- A **Super Admin** can create and manage multiple **Company** tenants
- Each company has its own **Admin** who manages their own users, data, and settings
- All data (invoices, quotations, products, employees, clients) is **fully isolated per company**
- Companies can choose from **system-wide templates** or create their own for invoices, quotations, and receipts

---

## Role Hierarchy

```
super_admin
    └── admin (per company)
            ├── manager (per company)
            └── user (per company)
```

| Role | Scope | Capabilities |
|------|-------|-------------|
| `super_admin` | Global | Create/suspend/delete companies, assign company admins, manage global templates, view all data |
| `admin` | Company | Manage company users, settings, own templates, all CRUD within their company |
| `manager` | Company | Most CRUD operations, cannot manage users or billing |
| `user` | Company | Read + limited write (create invoices, scan items) |

---

## Database Strategy

**Single MongoDB Database, Shared Collections** — simpler migration, good enough for this scale.

Every tenant-scoped document gets a `companyId: ObjectId` field. All queries are filtered by `companyId`. Compound indexes enforce uniqueness per company.

### New Collections

| Collection | Purpose |
|------------|---------|
| `companies` | One document per tenant company (replaces singleton Company model) |
| `templates` | Invoice/quotation/receipt templates (system-wide and per-company) |
| `audit_logs` | Super admin actions log |

### Modified Collections (add `companyId`)

`users`, `invoices`, `quotations`, `products`, `employees`, `clients`, `categories`, `stock-history`, `salary-payments`

---

## Phase 1 — Core Schema & Infrastructure

### 1.1 New `companies` Collection

```typescript
CompanyDocument {
  _id: ObjectId
  name: string
  slug: string              // unique, URL-safe (e.g. "fitfuel-riyadh")
  email: string
  phone?: string
  address?: string
  city?: string
  zipCode?: string
  country?: string
  logo?: string
  bankName?: string
  bankAccount?: string
  bankIBAN?: string
  bankBranch?: string
  status: 'active' | 'suspended' | 'trial'
  plan?: string             // future billing hook
  trialEndsAt?: Date
  createdBy: ObjectId       // super_admin user id
  createdAt: Date
  updatedAt: Date
}
```

- Replace current singleton `getCompany()` with `getCompanyById(companyId)`
- Add unique index on `slug`
- Migrate existing single company record → first company document

### 1.2 Updated `users` Collection

```typescript
// Add fields:
companyId?: ObjectId        // null/undefined for super_admin only
role: 'super_admin' | 'admin' | 'manager' | 'user'
status: 'active' | 'suspended'
```

- Unique index changes from `{ email: 1 }` → `{ email: 1, companyId: 1 }` (same email allowed in different companies; super_admin email still globally unique)
- Existing users assigned to the migrated first company

### 1.3 `companyId` Added to All Resource Models

Add `companyId: ObjectId` (required) to:
- `invoices` → compound unique index on `{ invoiceNumber, companyId }`
- `quotations` → compound unique index on `{ quotationNumber, companyId }`
- `products` → compound unique index on `{ sku, companyId }` (when sku present)
- `employees`, `clients`, `categories`, `stock-history`, `salary-payments`

### 1.4 Fix Invoice/Quotation Number Generation

Current: counts all documents globally (breaks with multiple tenants).

Replace with per-company sequential counter stored on the company document:

```typescript
// on CompanyDocument
invoiceCounter: number    // default 0
quotationCounter: number  // default 0

// Generation logic (atomic)
findOneAndUpdate(
  { _id: companyId },
  { $inc: { invoiceCounter: 1 } },
  { returnDocument: 'after' }
)
// → "INV-0001" padded with company counter value
```

### 1.5 Updated JWT Payload

```typescript
JWTPayload {
  userId: string
  email: string
  role: 'super_admin' | 'admin' | 'manager' | 'user'
  companyId?: string        // absent for super_admin
  companySlug?: string      // for URL routing convenience
}
```

---

## Phase 2 — Middleware & API Guard Layer

### 2.1 New Middleware Functions (`lib/middleware.ts`)

```typescript
// Extract companyId from JWT, attach to request context
requireTenantAccess(handler)

// Super admin only
requireSuperAdmin(handler)

// Ensures user belongs to the company in the URL param
requireSameCompany(handler)
```

### 2.2 API Route Pattern Updates

All existing resource routes add companyId filtering:

```typescript
// BEFORE (single-tenant)
const invoices = await getCollection().find({}).toArray()

// AFTER (multi-tenant)
const { companyId } = request.user   // from JWT via middleware
const invoices = await getCollection().find({ companyId: new ObjectId(companyId) }).toArray()
```

### 2.3 New Super Admin API Routes

```
POST   /api/super/companies            → create company
GET    /api/super/companies            → list all companies
PATCH  /api/super/companies/[id]       → update/suspend company
DELETE /api/super/companies/[id]       → delete company + all data
POST   /api/super/companies/[id]/admin → assign admin to company
GET    /api/super/stats                → platform-wide stats
GET    /api/super/audit-logs           → audit trail
```

### 2.4 Updated Auth Routes

```
POST /api/auth/login     → returns companyId + companySlug in token
GET  /api/auth/me        → returns company info with user
```

---

## Phase 3 — Templates System

### 3.1 `templates` Collection Schema

```typescript
TemplateDocument {
  _id: ObjectId
  name: string
  type: 'invoice' | 'quotation' | 'receipt' | 'delivery_note'
  scope: 'system' | 'company'    // system = created by super_admin, company = per-tenant
  companyId?: ObjectId           // null for system templates
  isDefault: boolean             // the template auto-selected for new docs
  isActive: boolean

  // Layout & Design config (JSON — rendered on frontend)
  layout: {
    orientation: 'portrait' | 'landscape'
    colorScheme: {
      primary: string            // hex
      secondary: string
      accent: string
      background: string
    }
    font: string
    logo: {
      show: boolean
      position: 'left' | 'center' | 'right'
      size: 'small' | 'medium' | 'large'
    }
    header: {
      showCompanyName: boolean
      showTagline: boolean
      showAddress: boolean
      showContact: boolean
    }
    table: {
      style: 'minimal' | 'striped' | 'bordered' | 'classic'
      showRowNumbers: boolean
      showProductCode: boolean
    }
    footer: {
      showBankDetails: boolean
      showNotes: boolean
      showSignature: boolean
      customText?: string
    }
    showWatermark: boolean
    watermarkText?: string
    showQRCode: boolean         // QR code of invoice URL
  }

  createdBy: ObjectId
  createdAt: Date
  updatedAt: Date
}
```

### 3.2 Template API Routes

```
GET    /api/templates              → list available (system + own company)
POST   /api/templates              → create company template (admin only)
PATCH  /api/templates/[id]         → update template
DELETE /api/templates/[id]         → delete company template
POST   /api/templates/[id]/default → set as default for company

// Super admin only
POST   /api/super/templates        → create system template
GET    /api/super/templates        → manage all system templates
```

### 3.3 Company Template Selection

Add to `CompanyDocument`:

```typescript
defaultInvoiceTemplateId?: ObjectId
defaultQuotationTemplateId?: ObjectId
defaultReceiptTemplateId?: ObjectId
```

When generating a document, the API resolves: company template → system template → built-in fallback.

### 3.4 Built-in System Templates (ship with seed script)

| Name | Type | Style |
|------|------|-------|
| Classic | invoice/quotation/receipt | Traditional, black & white |
| Modern | invoice/quotation/receipt | Clean, blue accent |
| Minimal | invoice/quotation/receipt | Whitespace-heavy, sans-serif |
| Bold | invoice | Dark header, high contrast |
| Arabic RTL | invoice/quotation | Right-to-left layout support |

---

## Phase 4 — Super Admin Dashboard

### 4.1 New Routes (UI)

```
/super                           → Super admin home (platform stats)
/super/companies                 → Company list (create, search, filter by status)
/super/companies/[id]            → Company detail (users, usage, settings)
/super/companies/[id]/users      → Company users management
/super/templates                 → Global template manager
/super/audit-logs                → Admin action history
```

### 4.2 Super Admin Dashboard Stats

- Total companies (active / suspended / trial)
- Total users across all companies
- Total invoices / quotations / revenue (platform-wide)
- Monthly growth chart
- Companies table with: name, users count, invoices count, status, created date

### 4.3 Company Detail Page

- Edit company info (name, logo, contact)
- Suspend / reactivate company
- View company users (with ability to reset passwords or suspend)
- Assign or change admin
- View company's invoices/quotations count (read-only audit)

---

## Phase 5 — Frontend Auth & Context Updates

### 5.1 AuthContext Changes (`context/AuthContext.tsx`)

```typescript
// Add to auth state
companyId: string | null
companySlug: string | null
isSuperAdmin: boolean
company: CompanyResponse | null   // fetched on login
```

### 5.2 Company-Aware API Client (`lib/api.ts`)

The JWT already carries `companyId` — no changes needed to headers. The backend reads `companyId` from the verified token, not from client headers (prevents spoofing).

### 5.3 Dashboard Layout Updates

- Super admin sees a different sidebar (no invoice/product links, only company management)
- Regular dashboard shows company name and logo in the navbar
- Template selector appears in invoice/quotation create/edit pages

---

## Phase 6 — Data Migration Script

Update `scripts/seed.ts` or create `scripts/migrate-to-multi-tenant.ts`:

1. Create a `companies` document for the existing data (name: "Default Company")
2. Find all documents in `users`, `invoices`, `quotations`, `products`, `employees`, `clients`, `categories`, `stock-history`, `salary-payments`
3. Set `companyId` = new company's `_id` on every document
4. Update `users` collection: change the first `admin` role user's role to stay as `admin` for this company
5. Create a `super_admin` user (prompted from CLI or env vars)
6. Seed the 5 built-in system templates
7. Set `invoiceCounter` and `quotationCounter` on the company document by counting existing docs

---

## Phase 7 — Index Strategy

```typescript
// Compound indexes to add after schema migration
users:          { email: 1, companyId: 1 }  unique
invoices:       { companyId: 1, createdAt: -1 }
invoices:       { companyId: 1, invoiceNumber: 1 }  unique
quotations:     { companyId: 1, createdAt: -1 }
quotations:     { companyId: 1, quotationNumber: 1 } unique
products:       { companyId: 1, name: 1 }
products:       { companyId: 1, sku: 1 }  sparse unique
employees:      { companyId: 1 }
clients:        { companyId: 1 }
categories:     { companyId: 1, name: 1 }  unique
templates:      { scope: 1 }
templates:      { companyId: 1, type: 1 }
companies:      { slug: 1 }  unique
companies:      { status: 1 }
```

---

## Implementation Order (Recommended)

```
Phase 1  →  Schema + Models        (no UI, pure backend)
Phase 2  →  Middleware + API guards (no UI, pure backend)
Phase 6  →  Migration script       (run once against dev DB)
Phase 3  →  Templates system       (backend + basic UI)
Phase 5  →  Frontend auth updates  (AuthContext + apiClient)
Phase 4  →  Super admin dashboard  (UI-heavy)
Phase 7  →  Indexes                (run after migration, before prod)
```

---

## Files to Create (New)

```
lib/models/Template.ts
lib/models/AuditLog.ts
lib/tenant.ts                          # companyId extraction helpers
app/api/super/companies/route.ts
app/api/super/companies/[id]/route.ts
app/api/super/companies/[id]/admin/route.ts
app/api/super/templates/route.ts
app/api/super/stats/route.ts
app/api/templates/route.ts
app/api/templates/[id]/route.ts
app/super/layout.tsx
app/super/page.tsx
app/super/companies/page.tsx
app/super/companies/[id]/page.tsx
app/super/templates/page.tsx
app/super/audit-logs/page.tsx
components/templates/TemplatePreview.tsx
components/templates/TemplatePicker.tsx
components/templates/TemplateEditor.tsx
scripts/migrate-to-multi-tenant.ts
```

## Files to Modify (Existing)

```
lib/models/User.ts           → add companyId, status, super_admin role
lib/models/Company.ts        → replace singleton with full CRUD multi-company model
lib/models/Invoice.ts        → add companyId; fix invoiceNumber generation
lib/models/Quotation.ts      → add companyId; fix quotationNumber generation
lib/models/Product.ts        → add companyId
lib/models/Employee.ts       → add companyId
lib/models/Client.ts         → add companyId
lib/models/Category.ts       → add companyId
lib/models/StockHistory.ts   → add companyId
lib/models/SalaryPayment.ts  → add companyId
lib/auth.ts                  → add companyId + companySlug to JWT payload
lib/middleware.ts             → add requireTenantAccess, requireSuperAdmin
lib/validation.ts             → add company create/update schemas, template schemas
types/models.ts               → add SuperAdmin role, template types
types/api.ts                  → add CompanyResponse, TemplateResponse
context/AuthContext.tsx       → add companyId, isSuperAdmin, company state
app/api/auth/login/route.ts   → return companyId/slug in response
app/api/auth/me/route.ts      → return company info
app/api/invoices/route.ts     → add companyId filter to all queries
app/api/quotations/route.ts   → add companyId filter
app/api/inventory/route.ts    → add companyId filter
app/api/employees/route.ts    → add companyId filter
app/api/clients/route.ts      → add companyId filter
app/api/categories/route.ts   → add companyId filter
app/api/dashboard/route.ts    → add companyId filter
app/api/accounts/route.ts     → add companyId filter
app/api/settings/route.ts     → scope to company
app/dashboard/layout.tsx      → add company info to sidebar
app/dashboard/invoices/...    → add template picker
app/dashboard/quotations/...  → add template picker
scripts/seed.ts               → add company + super_admin + system templates
```

---

## Open Questions / Decisions Needed

1. **Super admin login URL** — use `/super/login` (separate page) or same `/login` with role-based redirect?
2. **Company slug in URL** — should dashboard routes include company slug (`/dashboard/fitfuel/invoices`) or stay as `/dashboard/invoices` (company resolved from JWT only)?
3. **Template rendering** — pure CSS/HTML (print-friendly) or a PDF generation library (e.g. `@react-pdf/renderer`)?
4. **Company logo storage** — local `/public/uploads/` or cloud storage (S3/Cloudflare R2)?
5. **Billing/plan limits** — enforce per-plan limits (e.g. max 5 users, max 500 invoices) from the start, or defer?
6. **Arabic RTL template** — full RTL layout flip or just right-aligned text column?
