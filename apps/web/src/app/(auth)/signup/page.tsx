"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AuthCard } from "../auth-card";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError("Use at least 8 characters");
    setLoading(true);
    setError(null);
    const { data, error: err } = await createClient().auth.signUp({
      email,
      password,
      options: { data: { display_name: name } },
    });
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    if (data.session) window.location.assign("/");
    else {
      setCheckEmail(true);
      setLoading(false);
    }
  }

  return (
    <AuthCard title="Create your Studio" text="One idea in, a scheduled video series out.">
      {checkEmail ? (
        <div className="note green">Check your inbox to confirm your email, then sign in.</div>
      ) : (
        <form onSubmit={onSubmit} className="stack">
          <div className="field"><label htmlFor="name">Name</label><input id="name" value={name} onChange={(e) => setName(e.target.value)} required /></div>
          <div className="field"><label htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="field"><label htmlFor="password">Password</label><input id="password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          {error && <div className="err">{error}</div>}
          <button className="btn primary" disabled={loading} type="submit">{loading ? "Creating…" : "Create account"}</button>
        </form>
      )}
      <p className="xs muted" style={{ marginTop: 16 }}>Already have an account? <Link href="/login" className="linklike">Sign in</Link></p>
    </AuthCard>
  );
}
