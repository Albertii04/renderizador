import type { PropsWithChildren, ReactNode } from "react";

type ShellProps = PropsWithChildren<{
  title: string;
  eyebrow: string;
  actions?: ReactNode;
  subtitle?: string;
}>;

export function Shell({ title, eyebrow, actions, subtitle, children }: ShellProps) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050816] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(117,163,255,0.14),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(34,197,94,0.12),transparent_24%),linear-gradient(180deg,#050816_0%,#060b1c_55%,#0a1020_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.04)_1px,transparent_1px)] bg-[size:48px_48px]" />
      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8 md:px-10 md:py-10">
        <header className="mb-10 flex flex-col gap-6 rounded-[28px] border border-white/8 bg-white/4 px-6 py-5 shadow-[0_24px_120px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.42em] text-sky-200/80">{eyebrow}</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-[-0.03em] text-white md:text-5xl">{title}</h1>
              {subtitle ? <p className="mt-3 max-w-2xl text-sm text-slate-300 md:text-base">{subtitle}</p> : null}
            </div>
            <div className="flex items-center gap-3 text-xs uppercase tracking-[0.28em] text-slate-400">
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.75)]" />
              Station runtime
            </div>
          </div>
          {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
        </header>
        {children}
      </div>
    </main>
  );
}
