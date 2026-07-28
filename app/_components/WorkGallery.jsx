'use client';

import { useState } from 'react';
import Lightbox from './Lightbox';

/**
 * Work 詳細頁的圖片區：封面 + 專案其他詳細圖，全部共用同一組 Lightbox
 * 可左右切換（還原舊站 numbermuu.com fancybox 的體驗）。
 *
 * @param {string} cover 封面圖網址
 * @param {string} title 作品標題（作為 alt）
 * @param {Array<{image: string, caption?: string}|string>} images 詳細圖清單
 */
export default function WorkGallery({ cover, full, title, images = [] }) {
  const [openIndex, setOpenIndex] = useState(null);

  const detail = (images || [])
    .map((img) => (typeof img === 'string' ? { image: img, caption: '' } : img))
    .filter((img) => img?.image);

  const heroImage = full || cover;

  // Lightbox 的完整清單：大圖（原圖或封面）在最前，接著所有詳細圖
  const lightboxImages = [];
  if (heroImage) lightboxImages.push({ src: heroImage, alt: title || '' });
  detail.forEach((img) => lightboxImages.push({ src: img.image, alt: img.caption || title || '' }));

  const coverOffset = heroImage ? 1 : 0;

  return (
    <>
      {heroImage && (
        <div className="overflow-hidden rounded-2xl bg-soft/50">
          <button
            type="button"
            className="lightbox-trigger w-full"
            onClick={() => setOpenIndex(0)}
            aria-label={title || '放大圖片'}
          >
            <img src={heroImage} alt={title || ''} className="w-full object-contain" />
          </button>
        </div>
      )}

      {detail.length > 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {detail.map((img, index) => (
            <figure key={`${img.image}-${index}`} className="space-y-2">
              <button
                type="button"
                className="lightbox-trigger block w-full overflow-hidden rounded-2xl bg-soft/50"
                onClick={() => setOpenIndex(index + coverOffset)}
                aria-label={img.caption || '放大圖片'}
              >
                <img
                  src={img.image}
                  alt={img.caption || title || ''}
                  loading="lazy"
                  className="w-full object-contain"
                />
              </button>
              {img.caption && (
                <figcaption className="text-sm leading-relaxed text-accent/70">
                  {img.caption}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      )}

      <Lightbox
        images={lightboxImages}
        openIndex={openIndex}
        onClose={() => setOpenIndex(null)}
      />
    </>
  );
}
