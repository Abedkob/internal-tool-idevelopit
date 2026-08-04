import { ContactsClient } from "@/components/contacts/ContactsClient";
import { Suspense } from "react";

export const metadata = { title: "Contacts" };

export default function ContactsPage() {
  return (
    <Suspense
      fallback={
        <div className="surface loading-state">
          <span className="spinner" />
          Loading contacts…
        </div>
      }
    >
      <ContactsClient />
    </Suspense>
  );
}
