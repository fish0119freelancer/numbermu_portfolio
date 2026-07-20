'use client';

import { useState } from 'react';
import { useEditableData } from '../_components/useEditableData';
import { typeItems } from '../../data/type';
import Lightbox from '../_components/Lightbox';

export default function TypePage() {
  const { items } = useEditableData('typeItems', typeItems);
  const [openIndex, setOpenIndex] = useState(null);
  const list = (items || []).filter((item) => item?.image);

  const lightboxImages = list.map((item) => ({
    src: item.image,
    alt: item.title || '',
  }));

  return (
    <section className="section-wrapper">
      <div className="type-gallery">
        {list.map((item, index) => (
          <button
            type="button"
            key={`${item.image}-${index}`}
            className="lightbox-trigger"
            onClick={() => setOpenIndex(index)}
            aria-label={item.title || '放大圖片'}
          >
            <img
              src={item.image}
              alt={item.title || ''}
              loading="lazy"
            />
          </button>
        ))}
      </div>

      <Lightbox
        images={lightboxImages}
        openIndex={openIndex}
        onClose={() => setOpenIndex(null)}
      />
    </section>
  );
}
