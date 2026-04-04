# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server at localhost:3000
npm run build    # Build for production
npm run lint     # Run ESLint
npm run seed     # Seed the database with sample data (tsx scripts/seed.ts)
```

There is no test suite configured.

## Architecture Overview

This is a **multi-tenant Business Management System (BMS)** called FitFuel — a Next.js 15 app with App Router. It manages invoices, quotations, inventory, employees, clients, and accounting.

### Stack
- **Next.js 15** (App Router) with **React 19** and **TypeScript**
- **Chakra UI v3** for components, **Tailwind CSS v4** for utilities
- **MongoDB** (Atlas) with raw MongoDB driver (no Mongoose ORM in practice)
- **JWT** (jsonwebtoken) + **bcryptjs** for auth
- **Zod** for schema validation on both client and server

### Authentication Flow
- JWT tokens stored in `localStorage` under key `bms_user`
- `app/page.tsx` (root) reads localStorage and redirects to `/dashboard` or `/login`
- `context/AuthContext.tsx` provides global auth state; wraps `app/dashboard/layout.tsx`
- API routes are protected via `lib/middleware.ts` helpers: `authenticateRequest`, `requireAuth`, `requireRole`
- Three roles: `admin`, `manager`, `user`

### Data Flow
1. Client calls `lib/api.ts` (`apiClient`) which auto-attaches the JWT Bearer token
2. Next.js API routes in `app/api/` validate input with Zod schemas from `lib/validation.ts`
3. API routes call model helper functions in `lib/models/`
4. Models use raw MongoDB driver via `lib/mongodb.ts` connection

### Model Pattern
Each file in `lib/models/` exports:
- A Document interface (DB shape with `_id`)
- A Response interface (what the API returns, with string `id`)
- `getCollection()` — returns the typed MongoDB collection
- CRUD functions (`findById`, `create`, `update`, etc.)
- `toResponse()` — converts DB document to API response

Collections: `users`, `products`, `invoices`, `quotations`, `employees`, `clients`, `categories`, `companies`, `stock-history`, `salary-payments`

### API Route Pattern
API routes follow Next.js App Router conventions. Error handling is centralized in `lib/errors.ts` — custom error classes (`ValidationError`, `AuthenticationError`, `NotFoundError`, etc.) map to HTTP status codes via `handleError()`.

### Type Definitions
- `types/models.ts` — enums and shared model interfaces
- `types/api.ts` — `ApiResponse<T>` wrapper and endpoint-specific response types

### Environment Variables
```
MONGODB_URI    # MongoDB Atlas connection string (required)
JWT_SECRET     # Defaults to 'your-secret-key-change-in-production' if unset
JWT_EXPIRES_IN # Defaults to '7d'
```

### Theme & Styling
- Chakra UI theme config in `lib/theme.ts` with custom brand color palette and semantic tokens for dark/light mode
- `components/ui/provider.tsx` wraps the app with Chakra UI + next-themes
- Dark mode is supported throughout; use semantic color tokens rather than hardcoded colors

### Barcode/QR Scanning
- `components/scanner/BarcodeScanner.tsx` uses the `html5-qrcode` library
- Physical scanner input handled by `components/scanner/PhysicalScannerInput.tsx`
