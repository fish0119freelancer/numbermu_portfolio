'use client';

import { useState } from 'react';
import { useEditableData } from '../_components/useEditableData';
import { artItems } from '../../data/art';
import Lightbox from '../_components/Lightbox';

export default function ArtPage() {
  const { items } = useEditableData('artItems', artItems);
  const [openIndex, setOpenIndex] = useState(null);
  const list = (items || []).filter((item) => item?.image);

  const lightboxImages = list.map((item) => ({
    src: item.image,
    alt: item.title || '',
  }));

  const groupedRows = list.reduce((acc, item, index) => {
    const rowIndex = typeof item.row === 'number' ? item.row : Math.floor(index / 3);
    if (!acc[rowIndex]) {
      acc[rowIndex] = [];
    }
    acc[rowIndex].push({ ...item, _flatIndex: index });
    return acc;
  }, []);
  const rows = groupedRows.filter(Boolean);

  return (
    <section className="art-section">
      {rows.map((row, rowIndex) => (
        <div className="art-row" key={`art-row-${rowIndex}`}>
          {row.map((item, index) => {
            const widthNum = Number(item.width);
            const grow = Number.isFinite(widthNum) && widthNum > 0 ? widthNum : 450;
            return (
              <div
                className="art-item"
                key={`${item.image}-${index}`}
                style={{ '--art-grow': grow }}
              >
                <button
                  type="button"
                  className="lightbox-trigger"
                  onClick={() => setOpenIndex(item._flatIndex)}
                  aria-label={item.title || '放大圖片'}
                >
                  <img src={item.image} alt={item.title || ''} loading="lazy" />
                </button>
              </div>
            );
          })}
        </div>
      ))}

      <Lightbox
        images={lightboxImages}
        openIndex={openIndex}
        onClose={() => setOpenIndex(null)}
      />
    </section>
  );
}
