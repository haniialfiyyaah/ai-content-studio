"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AuthCard } from "../auth-card";

function LoginForm() {
  const next = useSearchParams().get("next") || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error: err } = await createClient().auth.signInWithPassword({ email, password });
    if (err) {
      setError(err.message || "Unable to sign in");
      setLoading(false);
      return;
    }
    // Full navigation so middleware sees the fresh auth cookies.
    window.location.assign(next.startsWith("/") && !next.startsWith("//") ? next : "/");
  }

  return (
    <form onSubmit={onSubmit} className="stack">
      <div className="field"><label htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div className="field"><label htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
      {error && <div className="err">{error}</div>}
      <button className="btn primary" disabled={loading} type="submit">{loading ? "Signing in…" : "Sign in"}</button>
      <div className="row between xs muted">
        <Link href="/signup" className="linklike">Create an account</Link>
        <Link href="/recover">Forgot password?</Link>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <AuthCard title="Welcome back" text="Sign in to continue to your Studio.">
      <Suspense><LoginForm /></Suspense>
    </AuthCard>
  );
}
