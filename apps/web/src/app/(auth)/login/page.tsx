"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Browser client sets auth cookies in this document (capstone-style).
      // Soft router.replace raced middleware and left the button "stuck" idle on /login.
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message || "Unable to sign in");
        setLoading(false);
        return;
      }

      const destination =
        next.startsWith("/") && !next.startsWith("//") ? next : "/";
      window.location.assign(destination);
    } catch {
      setError("Network error. Try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="auth-form">
      <div className="auth-field">
        <label htmlFor="email">Email</label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="auth-field">
        <label htmlFor="password">Password</label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && (
        <p className="auth-alert" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={loading} className="studio-button">
        {loading ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="auth-shell">
      <div className="studio-panel auth-card">
        <p className="auth-brand">AI Content Studio</p>
        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-copy">
          Sign in to continue to Overview and your creative workspace.
        </p>
        <Suspense fallback={<p className="auth-copy">Loading…</p>}>
          <LoginForm />
        </Suspense>
        <p className="auth-footer">
          New here? <Link href="/signup">Create an account</Link>
        </p>
      </div>
    </div>
  );
}
