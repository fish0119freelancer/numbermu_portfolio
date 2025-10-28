'use client';

import { useEffect, useMemo, useState } from 'react';

export default function PixilartSlider({ items }) {
  const slides = useMemo(
    () => (items || []).filter((item) => item?.image),
    [items],
  );

  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!slides.length) {
      setActiveIndex(0);
      return;
    }
    if (activeIndex >= slides.length) {
      setActiveIndex(0);
    }
  }, [slides, activeIndex]);

  const activeItem = slides[activeIndex] || slides[0];

  if (!slides.length) {
    return null;
  }

  return (
    <div className="custom-slider">
      <div className="main-image">
        <img
          src={activeItem.full || activeItem.image}
          alt={activeItem.title || ''}
          id="main-display"
        />
        {activeItem.caption ? (
          <p id="image-caption">{activeItem.caption}</p>
        ) : null}
      </div>
      <div className="thumbnail-strip">
        {slides.map((item, index) => (
          <button
            type="button"
            key={`${item.image}-${index}`}
            className={`thumbnail${index === activeIndex ? ' active' : ''}`}
            onClick={() => setActiveIndex(index)}
          >
            <img
              src={item.image}
              alt={item.title || ''}
              data-full={item.full || item.image}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
