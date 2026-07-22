import { workItems } from '../../../data/work';
import Link from 'next/link';
import WorkGallery from '../../_components/WorkGallery';

export function generateStaticParams() {
  return workItems
    .filter((item) => item.slug)
    .map((item) => ({
      slug: item.slug,
    }));
}

export default function WorkDetailPage({ params }) {
  const item = workItems.find((w) => w.slug === params.slug);

  if (!item) {
    return (
      <section className="section-wrapper">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-2xl font-semibold text-accent">找不到此作品</h1>
          <p className="mt-4 text-accent/70">請確認網址是否正確。</p>
          <Link
            href="/work"
            className="mt-6 inline-block rounded-full bg-accent px-6 py-2 text-sm font-semibold uppercase tracking-[0.35em] text-white transition hover:bg-accent/80"
          >
            返回作品集
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="section-wrapper">
      <div className="mx-auto max-w-4xl">
        {/* Back link */}
        <Link
          href="/work"
          className="mb-8 inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.3em] text-accent/60 transition hover:text-brand"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M10 3L5 8l5 5" />
          </svg>
          返回作品集
        </Link>

        {/* Cover + project detail images */}
        <WorkGallery cover={item.image} title={item.title} images={item.images} />

        {/* Title & caption */}
        <div className="mt-8 space-y-4">
          <h1 className="text-2xl font-semibold text-accent md:text-3xl">
            {item.title}
          </h1>
          {item.caption && (
            <p className="text-base leading-relaxed text-accent/70 md:text-lg">
              {item.caption}
            </p>
          )}
        </div>

        {/* Bottom nav */}
        <div className="mt-12 border-t border-soft/60 pt-6">
          <Link
            href="/work"
            className="rounded-full border border-soft px-5 py-2 text-sm font-semibold uppercase tracking-[0.3em] text-accent/70 transition hover:bg-soft/60"
          >
            查看全部作品
          </Link>
        </div>
      </div>
    </section>
  );
}
