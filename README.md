# idevelopit-vault

Internal CRM, work tracker, and expense console for a three-person team.

## Supabase setup

1. Create a Supabase project and run the SQL files in this order: `scripts/schema.sql`, `scripts/performance.sql`, `scripts/roles-and-expense-editing.sql`, `scripts/billing-foundation.sql`, `scripts/billing-functions.sql`, then `scripts/licensing-foundation.sql`. Use the matching verification scripts afterward.
2. Copy `.env.local.example` to `.env.local` and add the project URL and publishable key. Older projects may use the anon key alias shown in the example.
3. Create or invite the three team members from **Authentication → Users** in the Supabase dashboard. The database trigger creates their matching profile rows automatically.
4. If email confirmation is enabled, each invited user must confirm their address before password sign-in succeeds.
5. Optionally run `scripts/seed.sql` after the first user exists.

Never place a `service_role` key in a `NEXT_PUBLIC_` variable.

The role migration promotes the existing shared login to `superadmin`. Expense edit controls are visible only to that role, and Supabase RLS independently blocks updates from other roles. Because the team shares one login, everyone using those credentials has the same superadmin access.

## Billing rollout

The billing migrations are additive and preserve the original `payments` table. That table remains the legacy contact-level expected/received ledger used by the existing dashboard; actual invoice receipts are stored in `invoice_payments`.

`billing-foundation.sql` creates company settings, templates, contracts, invoices, invoice items, payment receipts, indexes, RLS, and the private `company-assets` Storage bucket. `billing-functions.sql` installs the protected operations for invoice numbering, server-calculated totals, snapshots, payments, status refresh, and monthly generation. Apply both before opening the new billing routes.

After applying them, run `scripts/billing-verification.sql` for read-only installation checks. Back up the project before rollback work: the migrations are additive, but dropping billing tables after real invoices exist is intentionally not automated.

The app assigns invoice numbers only when a draft is actually saved. Finalizing freezes company, customer, and template data. Printing uses the browser's Print / Save PDF flow with A4 print CSS; use “Background graphics” for exact template colors.

Only the existing public Supabase URL and publishable/anon key are required. Do not add a service-role key to the browser environment. Company images accept PNG, JPEG, or WebP up to 2 MB and remain in the authenticated-only bucket.

## Licensing rollout

The licensing foundation links every entitlement to a CRM contact and optionally to its originating invoice or contract. Full license keys are returned once when issued; only their digest, prefix, and last four characters are stored. Browser writes are blocked and superadmin mutations run through protected database functions.

Deploy the external activation service only after applying the licensing SQL. Generate asymmetric signing keys and follow [the licensing API runbook](docs/licensing-api.md). The public API supports activation, validation, heartbeat, deactivation, rate limiting, signed offline grace tokens, and a JWKS endpoint for external applications.

## Development

```bash
npm install
npm run dev
```

Validation commands:

```bash
npm run typecheck
npm test
npm run lint
npm run build
```
