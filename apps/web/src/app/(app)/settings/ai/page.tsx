import Link from "next/link";
import { AiProviderForm } from "@/components/settings/ai-provider-form";

export default function AiProvidersPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <Link
          href="/settings"
          className="text-sm font-medium text-muted transition hover:text-accent"
        >
          ← Settings
        </Link>
      </div>

      <section className="studio-panel p-6 md:p-8">
        <p className="text-sm font-medium uppercase tracking-[0.16em] text-accent">
          Settings
        </p>
        <h1 className="font-display mt-3 text-4xl tracking-tight">
          AI Providers
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted">
          Choose managed OpenAI or optional BYOK — connect, test, replace, or
          disconnect providers securely.
        </p>

        <div className="mt-8">
          <AiProviderForm />
        </div>
      </section>
    </div>
  );
}
