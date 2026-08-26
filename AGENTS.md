# Repository Guidelines

## Project Structure & Module Organization

- `app/` contains route groups, layouts, page entry points, and global feature styles.
- `components/` is organized by domain (`billing/`, `contacts/`, `licensing/`, `tasks/`) with shared primitives in `components/ui/`.
- `lib/` contains Supabase access, domain operations, formatting, validation, and colocated `*.test.ts` files.
- `types/db.ts` defines shared database and domain types.
- `scripts/` contains ordered Supabase SQL foundations, protected functions, verification queries, and utilities.
- `supabase/functions/` contains deployable Edge Functions and their shared server-only code.
- `public/` stores assets; `docs/` contains integration runbooks.

Use the `@/` alias for repository-root imports. Keep page files thin and place substantial client behavior in the matching domain component.

## Build, Test, and Development Commands

- `npm install` installs dependencies.
- `npm run dev` starts the local Next.js development server.
- `npm run typecheck` performs strict TypeScript checking.
- `npm run lint` runs Next.js and TypeScript ESLint rules with zero warnings allowed.
- `npm test` runs the Node test suites for billing and licensing validation.
- `npm run build` creates the production build.
- `npx supabase functions deploy license-api --project-ref <ref> --no-verify-jwt` deploys the public licensing function.

Run typecheck, lint, tests, and build before requesting review.

## Coding Style & Naming Conventions

Use TypeScript/TSX, two-space indentation, semicolons, and double quotes. Name React components and exported types in `PascalCase`; use `camelCase` for functions and variables. Client components begin with `"use client"`. Prefer domain-specific modules. Follow existing CSS names such as `license-*` and `billing-*`, and preserve responsive, keyboard-accessible behavior.

## Testing Guidelines

Tests use `node:test` and `node:assert/strict`. Name files `lib/<domain>-validation.test.ts`. Test business rules, boundary values, expiration, totals, and invalid input. Database migrations should include or update a read-only `scripts/*-verification.sql` file.

## Commit & Pull Request Guidelines

History uses short informal subjects; improve on this with concise imperative messages such as `Add license deletion controls`. Keep commits scoped to one concern. Pull requests should explain behavior and schema changes, list validation commands run, link relevant issues, and include desktop/mobile screenshots for UI work. Call out required SQL order, Edge Function deployment, or new secrets.

## Security & Configuration

Never commit `.env.local`, service-role keys, private signing JWKs, plaintext license keys, or generated build files. Browser code may use only publishable Supabase configuration. Privileged mutations belong in protected SQL functions or server-only Edge Functions with RLS enforced independently.
