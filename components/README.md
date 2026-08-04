# Component organization

Components are grouped by the feature that owns them. Route files in `app/` should
stay thin and render the corresponding feature client component.

```text
components/
├── billing/
│   ├── contracts/   Contract screens
│   ├── invoices/    Invoice lists, details, documents, and admin editing
│   ├── shared/      Billing-only form controls shared by billing features
│   └── templates/   Document template screens
├── contacts/        Contact lists, drawers, forms, and contact indicators
├── dashboard/       Dashboard-specific components
├── expenses/        Expense lists and editing dialogs
├── layout/          Application shell and navigation
├── pipeline/        Pipeline-specific components
├── settings/        General and billing settings panels
├── tasks/           Task lists and task dialogs
└── ui/              Small feature-agnostic UI components
```

## Import rules

- Import components through the `@/components/...` alias.
- Keep feature-specific components inside their owning feature folder.
- Move a component to `ui/` only when it is genuinely feature-agnostic and reused.
- Put billing-only shared controls in `billing/shared/`, not global `ui/`.
- Prefer explicit file imports over barrel exports so dependencies remain visible
  and client bundles do not pull in unrelated modules.
