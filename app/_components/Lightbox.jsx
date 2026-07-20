'use client';

import { useState, useEffect } from 'react';

/**
 * 彈出大圖瀏覽元件 (Lightbox)
 * @param {Array<{src: string, alt: string}>} images 圖片陣列
 * @param {number|null} openIndex 當前開啟的圖片索引，null 表示關閉
 * @param {Function} onClose 關閉回調函式
 */
export default function Lightbox({ images = [], openIndex = null, onClose }) {
  const isOpen = openIndex !== null && typeof openIndex === 'number' && openIndex >= 0 && openIndex < images.length;
  const [currentIndex, setCurrentIndex] = useState(openIndex ?? 0);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(openIndex);
    }
  }, [openIndex, isOpen]);

  useEffect(() => {
    setImgError(false);
  }, [currentIndex]);

  // 鎖定背景捲動，關閉時還原原本的 overflow 設定
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  // 鍵盤事件監聽 (Esc 關閉，方向鍵切換)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
      } else if (e.key === 'ArrowLeft') {
        if (images.length > 1) {
          setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
        }
      } else if (e.key === 'ArrowRight') {
        if (images.length > 1) {
          setCurrentIndex((prev) => (prev + 1) % images.length);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, images.length, onClose]);

  if (!isOpen) return null;

  const currentImg = images[currentIndex] || {};

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose?.();
    }
  };

  return (
    <div
      className="lightbox-overlay"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        className="lightbox-close"
        onClick={onClose}
        aria-label="關閉"
      >
        &times;
      </button>

      {images.length > 1 && (
        <>
          <button
            type="button"
            className="lightbox-nav lightbox-prev"
            onClick={(e) => {
              e.stopPropagation();
              setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
            }}
            aria-label="上一張"
          >
            &#10094;
          </button>
          <button
            type="button"
            className="lightbox-nav lightbox-next"
            onClick={(e) => {
              e.stopPropagation();
              setCurrentIndex((prev) => (prev + 1) % images.length);
            }}
            aria-label="下一張"
          >
            &#10095;
          </button>
        </>
      )}

      <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
        {imgError ? (
          <div className="lightbox-error">圖片載入失敗</div>
        ) : (
          <img
            src={currentImg.src}
            alt={currentImg.alt || ''}
            className="lightbox-image"
            onError={() => setImgError(true)}
          />
        )}
      </div>
    </div>
  );
}

/**
 * 用於 Server Component (如 WorkDetailPage) 的單圖點擊放大外裝元件
 */
export function LightboxImage({ src, alt, className = '' }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={`lightbox-trigger ${className}`}
        onClick={() => setIsOpen(true)}
        aria-label={alt || '放大圖片'}
      >
        <img src={src} alt={alt || ''} className={className} />
      </button>
      <Lightbox
        images={[{ src, alt }]}
        openIndex={isOpen ? 0 : null}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}
