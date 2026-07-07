'use client';

import { useEditableData } from '../_components/useEditableData';
import { workItems } from '../../data/work';

export default function WorkPage() {
  const { items } = useEditableData('workItems', workItems);
  const list = (items || []).filter((item) => item?.image);

  return (
    <section className="section-wrapper">
      <div className="entries entries-work" data-archive="default" data-layout="grid" data-cards="simple">
        {list.map((item, index) => {
          const href = item.href || (item.slug ? `/work/${item.slug}` : null);
          const hasHref = href && href.trim();
          const isExternal = hasHref && href.startsWith('http');

          return (
            <article className="entry-card card-content" key={`${item.image}-${index}`}>
              {hasHref ? (
                <a
                  className="ct-media-container"
                  href={href}
                  target={isExternal ? '_blank' : undefined}
                  rel={isExternal ? 'noreferrer noopener' : undefined}
                >
                  <img src={item.image} alt={item.title || ''} />
                </a>
              ) : (
                <div className="ct-media-container">
                  <img src={item.image} alt={item.title || ''} />
                </div>
              )}
              {item.title ? (
                <h2 className="entry-title">
                  {hasHref ? (
                    <a
                      href={href}
                      target={isExternal ? '_blank' : undefined}
                      rel={isExternal ? 'noreferrer noopener' : undefined}
                    >
                      {item.title}
                    </a>
                  ) : (
                    <span>{item.title}</span>
                  )}
                </h2>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

