'use client';

import { useState } from 'react';
import Lightbox from './Lightbox';

/**
 * Work 詳細頁的圖片區：專案詳細圖，全部共用同一組 Lightbox
 * 可左右切換（還原舊站 numbermuu.com fancybox 的體驗）。
 *
 * @param {string} title 作品標題（作為 alt）
 * @param {Array<{image: string, caption?: string}|string>} images 詳細圖清單
 */
export default function WorkGallery({ title, images = [] }) {
  const [openIndex, setOpenIndex] = useState(null);

  const detail = (images || [])
    .map((img) => (typeof img === 'string' ? { image: img, caption: '' } : img))
    .filter((img) => img?.image);

  // Lightbox 的完整清單：所有詳細圖
  const lightboxImages = [];
  detail.forEach((img) => lightboxImages.push({ src: img.image, alt: img.caption || title || '' }));

  return (
    <>
      {detail.length > 0 ? (
        <div className="grid gap-6">
          {detail.map((img, index) => (
            <figure key={`${img.image}-${index}`} className="space-y-2">
              <button
                type="button"
                className="lightbox-trigger block w-full overflow-hidden rounded-2xl bg-soft/50"
                onClick={() => setOpenIndex(index)}
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
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-soft py-20 text-accent/40">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10 3h4l4 16H6L10 3z" />
            <path d="M8.5 9h7" />
            <path d="M7.5 14h9" />
            <path d="M3 21h18" />
          </svg>
          <p className="text-sm tracking-[0.2em]">施工中</p>
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
