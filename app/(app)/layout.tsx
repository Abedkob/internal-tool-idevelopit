import { redirect } from "next/navigation";
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("name,color")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <AppShell
      user={{
        email: user.email ?? "",
        name: profile?.name ?? user.email?.split("@")[0] ?? "Team member",
        color: profile?.color ?? "#3D5AF1",
      }}
    >
      {children}
    </AppShell>
  );
}
