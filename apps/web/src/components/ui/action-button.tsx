"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api } from "@/lib/client/api";
import { Spinner } from "./spinner";

/** Button that calls an API route, then refreshes the page (or navigates). */
export function ActionButton({
  path,
  method = "POST",
  body,
  confirm,
  className = "btn",
  redirectTo,
  children,
  disabled,
  title,
}: {
  path: string;
  method?: string;
  body?: unknown;
  confirm?: string;
  className?: string;
  redirectTo?: string;
  children: React.ReactNode;
  disabled?: boolean;
  title?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span style={{ display: "inline-flex", flexDirection: "column" }}>
      <button
        className={className}
        disabled={disabled || pending}
        aria-busy={pending}
        title={title}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          setError(null);
          start(async () => {
            try {
              await api(path, method, body ?? {});
              if (redirectTo) router.push(redirectTo);
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Something went wrong");
            }
          });
        }}
      >
        {pending ? <><Spinner /> {children}</> : children}
      </button>
      {error && <span className="err">{error}</span>}
    </span>
  );
}
