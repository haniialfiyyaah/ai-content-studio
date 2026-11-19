import Link from "next/link";

export default function RecoverPage() {
  return (
    <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10">
      <div className="studio-panel w-full max-w-md p-8 md:p-10">
        <p className="text-sm font-medium uppercase tracking-[0.16em] text-accent">
          AI Content Studio
        </p>
        <h1 className="font-display mt-3 text-3xl tracking-tight text-foreground">
          Recover account
        </h1>
        <p className="mt-2 text-sm text-muted">
          Password recovery will send a Supabase reset email. This flow is not
          wired yet — use the link below to return to sign in.
        </p>
        <p className="mt-6 text-sm text-muted">
          <Link
            href="/login"
            className="font-medium text-accent underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
