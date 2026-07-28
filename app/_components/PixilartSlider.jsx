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

  const grouped = useMemo(() => {
    const groups = new Map();
    slides.forEach((item, index) => {
      const key = (item.category || '').trim();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ item, index });
    });
    // 未分類（空字串 key）排最前
    const entries = [...groups.entries()];
    entries.sort((a, b) => {
      if (a[0] === '') return -1;
      if (b[0] === '') return 1;
      return 0; // 其餘維持插入順序
    });
    return entries;
  }, [slides]);

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
        {grouped.map(([category, members]) => (
          <div className="thumbnail-group" key={category || '__uncategorized__'}>
            {category ? <h3 className="thumbnail-group-title">{category}</h3> : null}
            <div className="thumbnail-grid">
              {members.map(({ item, index }) => (
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
        ))}
      </div>
    </div>
  );
}
