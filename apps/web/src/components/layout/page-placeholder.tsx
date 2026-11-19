interface PagePlaceholderProps {
  title: string;
  description: string;
}

export function PagePlaceholder({ title, description }: PagePlaceholderProps) {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="studio-panel p-8 md:p-10">
        <p className="text-sm font-medium uppercase tracking-[0.16em] text-accent">
          Coming online
        </p>
        <h1 className="font-display mt-3 text-4xl tracking-tight">{title}</h1>
        <p className="mt-3 max-w-2xl text-muted">{description}</p>
      </div>
    </div>
  );
}
