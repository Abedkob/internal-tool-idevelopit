import { SettingsClient } from "@/components/SettingsClient";
import { BillingSettings } from "@/components/BillingSettings";
export const metadata = { title: "Settings" };
export default function SettingsPage() {
  return <><BillingSettings /><SettingsClient /></>;
}
