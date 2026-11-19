"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface KitView {
  id: string;
  version: number;
  languageDefault: string | null;
  tone: string | null;
  audience: string | null;
  brandOrCreatorName: string | null;
  doSay: unknown[];
  dontSay: unknown[];
  visualNotes: string | null;
  updatedAt: string;
}

/**
 * Creative Kit tab panel — shows latest version and saves a new immutable version.
 */
export function CreativeKitPanel({
  projectId,
  initialKit,
}: {
  projectId: string;
  initialKit: KitView | null;
}) {
  const router = useRouter();
  const [kit, setKit] = useState<KitView | null>(initialKit);
  const [brandOrCreatorName, setBrandOrCreatorName] = useState(
    initialKit?.brandOrCreatorName ?? "",
  );
  const [tone, setTone] = useState(initialKit?.tone ?? "");
  const [audience, setAudience] = useState(initialKit?.audience ?? "");
  const [languageDefault, setLanguageDefault] = useState(
    initialKit?.languageDefault ?? "",
  );
  const [visualNotes, setVisualNotes] = useState(initialKit?.visualNotes ?? "");
  const [doSayText, setDoSayText] = useState(
    (initialKit?.doSay ?? []).map(String).join("\n"),
  );
  const [dontSayText, setDontSayText] = useState(
    (initialKit?.dontSay ?? []).map(String).join("\n"),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  async function saveVersion() {
    setPending(true);
    setError(null);
    setSavedMessage(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/creative-kit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandOrCreatorName: brandOrCreatorName.trim() || null,
          tone: tone.trim() || null,
          audience: audience.trim() || null,
          languageDefault: languageDefault.trim() || null,
          visualNotes: visualNotes.trim() || null,
          doSay: lines(doSayText),
          dontSay: lines(dontSayText),
        }),
      });

      const json = (await res.json()) as {
        status: string;
        data?: { kit?: KitView } | null;
        error?: { message?: string } | null;
      };

      if (!res.ok || json.status === "error" || !json.data?.kit) {
        setError(json.error?.message ?? "Unable to save Creative Kit");
        return;
      }

      const next = json.data.kit;
      setKit(next);
      setSavedMessage(`Saved as version ${next.version}`);
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl tracking-tight">Creative Kit</h2>
        <p className="mt-1 text-sm text-muted">
          Versioned brand voice and visual rules. Saving creates a new immutable
          version.
          {kit ? ` Current · v${kit.version}.` : " No kit yet."}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Brand / creator name"
          value={brandOrCreatorName}
          onChange={setBrandOrCreatorName}
        />
        <Field label="Tone" value={tone} onChange={setTone} />
        <Field label="Audience" value={audience} onChange={setAudience} />
        <Field
          label="Default language"
          value={languageDefault}
          onChange={setLanguageDefault}
          placeholder="en"
        />
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-foreground">Visual notes</span>
        <textarea
          className="min-h-24 w-full rounded-xl border border-border bg-surface-strong px-3 py-2 text-sm studio-focus-ring"
          value={visualNotes}
          onChange={(e) => setVisualNotes(e.target.value)}
        />
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-foreground">
            Do say (one per line)
          </span>
          <textarea
            className="min-h-28 w-full rounded-xl border border-border bg-surface-strong px-3 py-2 text-sm studio-focus-ring"
            value={doSayText}
            onChange={(e) => setDoSayText(e.target.value)}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-foreground">
            Don&apos;t say (one per line)
          </span>
          <textarea
            className="min-h-28 w-full rounded-xl border border-border bg-surface-strong px-3 py-2 text-sm studio-focus-ring"
            value={dontSayText}
            onChange={(e) => setDontSayText(e.target.value)}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="primary"
          disabled={pending}
          onClick={() => void saveVersion()}
        >
          {pending ? "Saving…" : kit ? "Save new version" : "Create kit"}
        </Button>
        {savedMessage && (
          <p className="text-sm text-accent" role="status">
            {savedMessage}
          </p>
        )}
        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <input
        className="w-full rounded-xl border border-border bg-surface-strong px-3 py-2 text-sm studio-focus-ring"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function lines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
