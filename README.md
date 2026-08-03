# Team Console

Internal CRM, work tracker, and expense console for a three-person team.

## Supabase setup

1. Create a Supabase project and run `scripts/schema.sql`, `scripts/performance.sql`, then `scripts/roles-and-expense-editing.sql`, in that order in the SQL editor. Use `scripts/performance-checks.sql` afterward to inspect the plans for paged list and cursor-feed queries.
2. Copy `.env.local.example` to `.env.local` and add the project URL and publishable key. Older projects may use the anon key alias shown in the example.
3. Create or invite the three team members from **Authentication → Users** in the Supabase dashboard. The database trigger creates their matching profile rows automatically.
4. If email confirmation is enabled, each invited user must confirm their address before password sign-in succeeds.
5. Optionally run `scripts/seed.sql` after the first user exists.

Never place a `service_role` key in a `NEXT_PUBLIC_` variable.

The role migration promotes the existing shared login to `superadmin`. Expense edit controls are visible only to that role, and Supabase RLS independently blocks updates from other roles. Because the team shares one login, everyone using those credentials has the same superadmin access.

## Development

```bash
npm install
npm run dev
```

Validation commands:

```bash
npm run typecheck
npm run build
```
