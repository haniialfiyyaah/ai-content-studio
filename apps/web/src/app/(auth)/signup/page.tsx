"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SignupPage() {
  const router = useRouter();
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
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, displayName }),
      });
      const json = await res.json();
      if (!res.ok || json.status === "error") {
        setError(json.error?.message ?? "Unable to create account");
        return;
      }
      if (json.data?.needsEmailConfirmation) {
        setInfo("Check your email to confirm your account, then sign in.");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
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
