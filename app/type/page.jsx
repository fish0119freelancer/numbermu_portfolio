'use client';

import { useEditableData } from '../_components/useEditableData';
import { typeItems } from '../../data/type';

export default function TypePage() {
  const { items } = useEditableData('typeItems', typeItems);
  const list = (items || []).filter((item) => item?.image);

  return (
    <section className="section-wrapper">
      <div className="type-gallery">
        {list.map((item, index) => (
          <img
            key={`${item.image}-${index}`}
            src={item.image}
            alt={item.title || ''}
            loading="lazy"
          />
        ))}
      </div>
    </section>
  );
}
