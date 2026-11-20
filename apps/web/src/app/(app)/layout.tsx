import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", data.user.id).maybeSingle();
  return <AppShell name={profile?.display_name || data.user.email || "Studio owner"}>{children}</AppShell>;
}
