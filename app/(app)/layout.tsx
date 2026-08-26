import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AppShell } from "@/components/layout/AppShell";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!hasSupabaseConfig()) redirect("/login");
  const requestHeaders = await headers();
  const userId = requestHeaders.get("x-idv-auth-user");
  const email = requestHeaders.get("x-idv-auth-email") ?? "";
  if (!userId) redirect("/login");
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("name,color")
    .eq("id", userId)
    .maybeSingle();

  return (
    <AppShell
      user={{
        email,
        name: profile?.name ?? (email ? email.split("@")[0] : "Team member"),
        color: profile?.color ?? "#3D5AF1",
      }}
    >
      {children}
    </AppShell>
  );
}
