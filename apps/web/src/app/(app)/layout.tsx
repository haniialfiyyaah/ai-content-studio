import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/server/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let session;
  try {
    session = await requireUser();
  } catch {
    redirect("/login");
  }
  const { supabase, user } = session;
  const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  return <AppShell name={profile?.display_name || user.email || "Studio owner"}>{children}</AppShell>;
}
