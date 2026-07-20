'use client';

import { useEditableData } from '../_components/useEditableData';
import { artItems } from '../../data/art';

export default function ArtPage() {
  const { items } = useEditableData('artItems', artItems);
  const list = (items || []).filter((item) => item?.image);
  const groupedRows = list.reduce((acc, item, index) => {
    const rowIndex = typeof item.row === 'number' ? item.row : Math.floor(index / 3);
    if (!acc[rowIndex]) {
      acc[rowIndex] = [];
    }
    acc[rowIndex].push(item);
    return acc;
  }, []);
  const rows = groupedRows.filter(Boolean);

  return (
    <section className="art-section">
      {rows.map((row, rowIndex) => (
        <div className="art-row" key={`art-row-${rowIndex}`}>
          {row.map((item, index) => {
            const widthNum = typeof item.width === 'number' ? item.width : Number(item.width);
            const itemWidth = typeof widthNum === 'number' && !Number.isNaN(widthNum) && widthNum > 0 ? widthNum : 450;
            return (
              <div
                className="art-item"
                key={`${item.image}-${index}`}
                style={{ width: `${itemWidth}px` }}
              >
                <img src={item.image} alt={item.title || ''} loading="lazy" />
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}
