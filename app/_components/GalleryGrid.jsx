'use client';

import Image from 'next/image';

function Media({ image, title }) {
  const isGif = image?.toLowerCase().endsWith('.gif') || image?.startsWith('data:');

  if (!image) {
    return (
      <div className="flex aspect-square items-center justify-center bg-soft text-accent/30">
        無圖片
      </div>
    );
  }

  if (isGif) {
    return (
      <img
        src={image}
        alt={title || '作品圖片'}
        loading="lazy"
        className="h-full w-full object-cover"
      />
    );
  }

  return (
    <Image
      src={image}
      alt={title || '作品圖片'}
      fill
      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
      className="object-cover"
    />
  );
}

export default function GalleryGrid({ items, columns = 3, aspect = 'square' }) {
  const columnClass = {
    2: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
  }[columns] || 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';

  const aspectClass =
    aspect === 'landscape'
      ? 'aspect-[4/3]'
      : aspect === 'portrait'
      ? 'aspect-[3/4]'
      : 'aspect-square';

  return (
    <section className="mx-auto max-w-6xl px-5 pb-20">
      <div className={`grid gap-6 md:gap-8 ${columnClass}`}>
        {items.map((item, index) => {
          const hasHref = item.href && item.href.trim();
          const isExternal = hasHref && item.href.startsWith('http');
          const Wrapper = hasHref ? 'a' : 'div';
          const wrapperProps = hasHref
            ? {
                href: item.href,
                target: isExternal ? '_blank' : undefined,
                rel: isExternal ? 'noreferrer noopener' : undefined,
              }
            : {};

          return (
            <Wrapper
              key={`${item.title || item.image}-${index}`}
              className="group relative block overflow-hidden rounded-3xl border border-soft/60 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
              {...wrapperProps}
            >
              <div className={`relative ${aspectClass} w-full overflow-hidden bg-soft/50`}>
                <Media image={item.image} title={item.title} />
              </div>
              {(item.title || item.caption || item.note) && (
                <div className="flex flex-col gap-2 px-5 py-4">
                  {item.title && (
                    <h2 className="text-base font-semibold text-accent">
                      {item.title}
                    </h2>
                  )}
                  {(item.caption || item.note) && (
                    <p className="text-sm leading-relaxed text-accent/70">
                      {item.caption || item.note}
                    </p>
                  )}
                </div>
              )}
            </Wrapper>
          );
        })}
      </div>
    </section>
  );
}
