import type { PropsWithChildren } from "react";

export function Card(props: PropsWithChildren<{ title: string; subtitle?: string }>) {
  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-2xl shadow-black/20">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">{props.title}</h2>
        {props.subtitle ? <p className="mt-1 text-sm text-slate-400">{props.subtitle}</p> : null}
      </div>
      {props.children}
    </section>
  );
}

export function SectionHeading(props: PropsWithChildren) {
  return <h3 className="text-sm font-medium uppercase tracking-[0.24em] text-slate-400">{props.children}</h3>;
}
