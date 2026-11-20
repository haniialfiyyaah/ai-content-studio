import { Sparkles } from "lucide-react";

export function AuthCard({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <div className="brand" style={{ padding: "0 0 22px" }}>
          <div className="brandmark"><Sparkles size={18} /></div>
          <div><strong>AI Content Studio</strong><small>YOUR CREATIVE WORKSPACE</small></div>
        </div>
        <h1 style={{ fontSize: 26 }}>{title}</h1>
        <p className="small muted" style={{ margin: "8px 0 22px", lineHeight: 1.6 }}>{text}</p>
        {children}
      </div>
    </main>
  );
}
