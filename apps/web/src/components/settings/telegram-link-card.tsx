"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface TelegramLink {
  id: string;
  telegramUserId: number;
  telegramChatId: number | null;
  linkedAt: string | null;
  notificationsEnabled: boolean;
}

interface Envelope<T> {
  status: "ok" | "accepted" | "error";
  data: T | null;
  error: { code: string; message: string } | null;
}

/**
 * Links the signed-in Studio owner to a Telegram numeric user id.
 */
export function TelegramLinkCard() {
  const [link, setLink] = useState<TelegramLink | null>(null);
  const [telegramUserId, setTelegramUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/integrations/telegram");
      const envelope = (await response.json()) as Envelope<{
        linked: boolean;
        link: TelegramLink | null;
      }>;
      if (!response.ok || envelope.status === "error") {
        throw new Error(envelope.error?.message ?? "Could not load Telegram link");
      }
      setLink(envelope.data?.link ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load Telegram link");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/integrations/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramUserId }),
      });
      const envelope = (await response.json()) as Envelope<{
        linked: boolean;
        link: TelegramLink | null;
      }>;
      if (!response.ok || envelope.status === "error") {
        throw new Error(envelope.error?.message ?? "Could not link Telegram");
      }
      setLink(envelope.data?.link ?? null);
      setTelegramUserId("");
      setMessage("Telegram linked. Message the bot again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not link Telegram");
    } finally {
      setBusy(false);
    }
  }

  async function onUnlink() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/integrations/telegram", {
        method: "DELETE",
      });
      const envelope = (await response.json()) as Envelope<{
        linked: boolean;
        link: null;
      }>;
      if (!response.ok || envelope.status === "error") {
        throw new Error(envelope.error?.message ?? "Could not unlink Telegram");
      }
      setLink(null);
      setMessage("Telegram unlinked.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unlink Telegram");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="mt-2 text-sm text-muted">Checking link status…</p>;
  }

  if (link) {
    return (
      <div className="mt-3 space-y-3">
        <p className="text-sm text-muted">
          Linked Telegram user ID{" "}
          <span className="font-medium text-foreground">
            {link.telegramUserId}
          </span>
          {link.linkedAt
            ? ` · since ${new Date(link.linkedAt).toLocaleString()}`
            : null}
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => void onUnlink()}
        >
          Unlink
        </Button>
        {message ? <p className="text-sm text-accent">{message}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    );
  }

  return (
    <form className="mt-3 space-y-3" onSubmit={onLink}>
      <p className="text-sm text-muted">
        Paste your numeric Telegram user ID (from the bot reply / @userinfobot),
        then message the bot again.
      </p>
      <Input
        inputMode="numeric"
        pattern="[0-9]+"
        required
        placeholder="e.g. 9172850538"
        value={telegramUserId}
        onChange={(event) => setTelegramUserId(event.target.value.trim())}
        disabled={busy}
      />
      <Button type="submit" disabled={busy || !telegramUserId}>
        Link Telegram
      </Button>
      {message ? <p className="text-sm text-accent">{message}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </form>
  );
}
