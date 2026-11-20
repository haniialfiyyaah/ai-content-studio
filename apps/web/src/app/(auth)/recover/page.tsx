"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AuthCard } from "../auth-card";

export default function RecoverPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setState("sending");
    const { error } = await createClient().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/login` });
    setState(error ? "error" : "sent");
  }

  return (
    <AuthCard title="Recover account" text="We'll email you a link to reset your password.">
      {state === "sent" ? (
        <div className="note green">If that email has an account, a reset link is on its way.</div>
      ) : (
        <form onSubmit={onSubmit} className="stack">
          <div className="field"><label htmlFor="email">Email</label><input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          {state === "error" && <div className="err">Could not send the email. Try again.</div>}
          <button className="btn primary" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Send reset link"}</button>
        </form>
      )}
      <p className="xs muted" style={{ marginTop: 16 }}><Link href="/login" className="linklike">Back to sign in</Link></p>
    </AuthCard>
  );
}
