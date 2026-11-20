import Link from "next/link";
import { Sparkles } from "lucide-react";

export function EmptyState({ title, text, cta = "Create with AI", href = "/#create" }: { title: string; text: string; cta?: string; href?: string }) {
  return (
    <div className="empty-state">
      <div className="iconTile" style={{ margin: "0 auto" }}><Sparkles size={17} /></div>
      <h3>{title}</h3>
      <p>{text}</p>
      <Link href={href} className="btn primary">{cta}</Link>
    </div>
  );
}

export function PageHead({ eyebrow, title, text, actions }: { eyebrow: string; title: string; text?: string; actions?: React.ReactNode }) {
  return (
    <div className="pagehead">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {text && <p>{text}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}
