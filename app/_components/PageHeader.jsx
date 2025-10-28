'use client';

export default function PageHeader({ title, subtitle }) {
  return (
    <section className="mx-auto max-w-6xl px-5 pb-8 pt-10 md:pb-12 md:pt-16">
      <h1 className="text-3xl font-semibold uppercase tracking-[0.45em] text-accent md:text-4xl">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-accent/70 md:text-base">
          {subtitle}
        </p>
      ) : null}
    </section>
  );
}
