'use client';

import { useEditableData } from '../_components/useEditableData';
import { workItems } from '../../data/work';

export default function WorkPage() {
  const { items } = useEditableData('workItems', workItems);
  const list = (items || []).filter((item) => item?.image);

  return (
    <section className="section-wrapper">
      <div className="entries" data-archive="default" data-layout="grid" data-cards="simple">
        {list.map((item, index) => (
          <article className="entry-card card-content" key={`${item.image}-${index}`}>
            <a
              className="ct-media-container"
              href={item.href || '#'}
              target={item.href?.startsWith('http') ? '_blank' : undefined}
              rel={item.href?.startsWith('http') ? 'noreferrer noopener' : undefined}
            >
              <img src={item.image} alt={item.title || ''} />
            </a>
            {item.title ? (
              <h2 className="entry-title">
                <a
                  href={item.href || '#'}
                  target={item.href?.startsWith('http') ? '_blank' : undefined}
                  rel={item.href?.startsWith('http') ? 'noreferrer noopener' : undefined}
                >
                  {item.title}
                </a>
              </h2>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
