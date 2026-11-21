"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { OPTION_FIELD_LABELS, type OptionField } from "@acs/domain";
import { api } from "@/lib/client/api";
import { Spinner } from "@/components/ui/spinner";

/** Pick one of the AI-generated alternatives for a field (no free text). */
export function OptionPicker({
  contentId,
  field,
  options,
  selected,
  disabled,
  preview,
}: {
  contentId: string;
  field: OptionField;
  options: string[];
  selected: number;
  disabled?: boolean;
  preview?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(selected);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function choose(index: number) {
    const prev = value;
    setValue(index);
    setError(null);
    start(async () => {
      try {
        await api(`/api/contents/${contentId}`, "PATCH", { field, index });
        router.refresh();
      } catch (e) {
        setValue(prev);
        setError(e instanceof Error ? e.message : "Could not save");
      }
    });
  }

  const short = (s: string) => (s.length > 110 ? `${s.slice(0, 107)}…` : s);
  return (
    <div className="option-field">
      <label>
        <span>{OPTION_FIELD_LABELS[field]}</span>
        <span className="faint" style={{ letterSpacing: 0, textTransform: "none" }}>
          {pending ? <><Spinner size={11} /> Saving…</> : `${options.length} options`}
        </span>
      </label>
      <select
        className="option-select"
        value={value}
        disabled={disabled || pending || options.length < 2}
        onChange={(e) => choose(Number(e.target.value))}
      >
        {options.map((o, i) => (
          <option key={i} value={i}>{`Option ${i + 1} — ${short(o)}`}</option>
        ))}
      </select>
      {preview && <div className="option-preview">{options[value]}</div>}
      {error && <span className="err">{error}</span>}
    </div>
  );
}
