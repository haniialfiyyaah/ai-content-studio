"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Preferences {
  ownerId: string;
  openaiMode: "managed" | "byok";
  preferredModelId: string | null;
  version: number;
  updatedAt: string;
}

interface Connection {
  id: string;
  provider: "openai";
  last4: string | null;
  keyFingerprint: string | null;
  status: string;
  verifiedAt: string | null;
  lastErrorCode: string | null;
  rotatedAt: string | null;
}

interface UsageSummary {
  policy: {
    managedMonthlyAllowance: number;
    managedUsed: number;
    managedRemaining: number;
    currency: string;
  };
}

interface Envelope<T> {
  status: "ok" | "accepted" | "error";
  data: T | null;
  error: { code: string; message: string } | null;
}

/**
 * Client form for managed vs BYOK OpenAI — never silently falls back.
 */
export function AiProviderForm() {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [prefsRes, usageRes] = await Promise.all([
        fetch("/api/settings/ai-provider"),
        fetch("/api/settings/ai-usage"),
      ]);
      const prefsJson = (await prefsRes.json()) as Envelope<{
        preferences: Preferences;
        connection: Connection | null;
      }>;
      const usageJson = (await usageRes.json()) as Envelope<UsageSummary>;

      if (prefsJson.status === "error" || !prefsJson.data) {
        throw new Error(prefsJson.error?.message ?? "Failed to load settings");
      }
      setPreferences(prefsJson.data.preferences);
      setConnection(prefsJson.data.connection);
      if (usageJson.status === "ok" && usageJson.data) {
        setUsage(usageJson.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function switchMode(mode: "managed" | "byok") {
    if (!preferences || busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/ai-provider/mode", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          expectedVersion: preferences.version,
        }),
      });
      const json = (await res.json()) as Envelope<{ preferences: Preferences }>;
      if (json.status === "error" || !json.data) {
        throw new Error(json.error?.message ?? "Failed to update mode");
      }
      setPreferences(json.data.preferences);
      setMessage(
        mode === "byok"
          ? "BYOK mode enabled — your key will be billed for OpenAI calls."
          : "Managed mode enabled — studio allowance applies.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update mode");
    } finally {
      setBusy(false);
    }
  }

  async function onConnect(event: FormEvent) {
    event.preventDefault();
    if (!apiKey.trim() || busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/ai-provider/openai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      const json = (await res.json()) as Envelope<{ connection: Connection }>;
      if (json.status === "error" || !json.data) {
        throw new Error(json.error?.message ?? "Failed to connect key");
      }
      setConnection(json.data.connection);
      setApiKey("");
      setMessage("Key stored. Run Test connection before enabling BYOK.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect key");
    } finally {
      setBusy(false);
    }
  }

  async function onTest() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/ai-provider/openai/test", {
        method: "POST",
      });
      const json = (await res.json()) as Envelope<{
        connection: Connection;
        fixture: boolean;
        modelSample?: string;
      }>;
      if (json.status === "error" || !json.data) {
        throw new Error(json.error?.message ?? "Connection test failed");
      }
      setConnection(json.data.connection);
      setMessage(
        json.data.fixture
          ? "Fixture verification succeeded — key marked connected."
          : `Live verification succeeded (${json.data.modelSample ?? "ok"}).`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection test failed");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function onDisconnect() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/ai-provider/openai", {
        method: "DELETE",
      });
      const json = (await res.json()) as Envelope<{
        disconnected: true;
        preferences: Preferences;
      }>;
      if (json.status === "error" || !json.data) {
        throw new Error(json.error?.message ?? "Failed to disconnect");
      }
      setPreferences(json.data.preferences);
      setConnection(null);
      setMessage("OpenAI BYOK disconnected. Mode set to managed if needed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <p className="text-sm text-muted">Loading AI provider settings…</p>
    );
  }

  const mode = preferences?.openaiMode ?? "managed";
  const canEnableByok = connection?.status === "connected";

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-2xl tracking-tight">Billing mode</h2>
        <p className="max-w-2xl text-sm text-muted">
          Managed uses the studio OpenAI allowance. BYOK bills your own key and
          never falls back to managed if the key fails.
        </p>
        <div className="flex flex-wrap gap-3">
          <ModeChip
            active={mode === "managed"}
            label="Managed"
            disabled={busy}
            onClick={() => void switchMode("managed")}
          />
          <ModeChip
            active={mode === "byok"}
            label="Bring your own key"
            disabled={busy || (!canEnableByok && mode !== "byok")}
            onClick={() => void switchMode("byok")}
          />
        </div>
        {!canEnableByok && mode !== "byok" && (
          <p className="text-xs text-muted">
            Connect and test an OpenAI key before enabling BYOK.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-4 border-t border-border pt-8">
        <h2 className="font-display text-2xl tracking-tight">OpenAI key</h2>
        {connection && connection.status !== "disconnected" ? (
          <div className="rounded-xl border border-border bg-surface-strong px-4 py-3 text-sm">
            <p>
              Status:{" "}
              <span className="font-medium capitalize">{connection.status}</span>
              {connection.last4 ? ` · ••••${connection.last4}` : null}
            </p>
            {connection.verifiedAt && (
              <p className="mt-1 text-xs text-muted">
                Verified {new Date(connection.verifiedAt).toLocaleString()}
              </p>
            )}
            {connection.lastErrorCode && (
              <p className="mt-1 text-xs text-danger">
                Last error: {connection.lastErrorCode}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">No BYOK key connected.</p>
        )}

        <form onSubmit={onConnect} className="flex flex-col gap-3 sm:flex-row">
          <Input
            type="password"
            autoComplete="off"
            placeholder="sk-…"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            disabled={busy}
            className="sm:max-w-md"
          />
          <Button type="submit" disabled={busy || apiKey.trim().length < 20}>
            {connection ? "Replace key" : "Connect key"}
          </Button>
        </form>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={busy || !connection || connection.status === "disconnected"}
            onClick={() => void onTest()}
          >
            Test connection
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy || !connection || connection.status === "disconnected"}
            onClick={() => void onDisconnect()}
          >
            Disconnect
          </Button>
        </div>
      </section>

      {usage && (
        <section className="flex flex-col gap-2 border-t border-border pt-8">
          <h2 className="font-display text-2xl tracking-tight">Usage</h2>
          <p className="text-sm text-muted">
            Managed remaining: {usage.policy.managedRemaining.toFixed(2)}{" "}
            {usage.policy.currency} of{" "}
            {usage.policy.managedMonthlyAllowance.toFixed(2)}
          </p>
        </section>
      )}

      {message && (
        <p className="rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function ModeChip({
  active,
  label,
  disabled,
  onClick,
}: {
  active: boolean;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-xl border px-4 py-2.5 text-sm font-medium transition studio-focus-ring disabled:opacity-50",
        active
          ? "border-accent bg-accent/10 text-foreground"
          : "border-border bg-surface-strong text-muted hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
