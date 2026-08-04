import { Suspense } from "react";
import { ExpensesClient } from "@/components/expenses/ExpensesClient";
export const metadata = { title: "Expenses" };
export default function ExpensesPage() {
  return (
    <Suspense
      fallback={
        <div className="surface loading-state">Loading expenses...</div>
      }
    >
      <ExpensesClient />
    </Suspense>
  );
}
