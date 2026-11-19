"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    try {
      const supabase = createClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName || undefined },
        },
      });

      if (signUpError) {
        setError(signUpError.message || "Unable to create account");
        setLoading(false);
        return;
      }

      if (!data.session) {
        setInfo("Check your email (Mailtrap) to confirm, then sign in.");
        setLoading(false);
        return;
      }

      window.location.assign("/");
    } catch {
      setError("Network error. Try again.");
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="studio-panel auth-card">
        <p className="auth-brand">AI Content Studio</p>
        <h1 className="auth-title">Create account</h1>
        <p className="auth-copy">
          Start from Overview and let the agent open your first Draft Project.
        </p>
        <form onSubmit={onSubmit} className="auth-form">
          <div className="auth-field">
            <label htmlFor="displayName">Display name</label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="auth-field">
            <label htmlFor="email">Email</label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="auth-field">
            <label htmlFor="password">Password</label>
            <Input
              id="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <p className="auth-alert" role="alert">
              {error}
            </p>
          )}
          {info && (
            <p className="auth-alert" role="status" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
              {info}
            </p>
          )}
          <Button type="submit" size="lg" disabled={loading} className="studio-button">
            {loading ? "Creating…" : "Create account"}
          </Button>
        </form>
        <p className="auth-footer">
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
