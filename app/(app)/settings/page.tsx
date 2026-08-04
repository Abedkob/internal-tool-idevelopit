import { SettingsClient } from "@/components/settings/SettingsClient";
import { BillingSettings } from "@/components/settings/BillingSettings";
export const metadata = { title: "Settings" };
export default function SettingsPage() {
  return <><BillingSettings /><SettingsClient /></>;
}
