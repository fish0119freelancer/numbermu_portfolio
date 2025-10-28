'use client';

import GalleryGrid from './_components/GalleryGrid';
import PageHeader from './_components/PageHeader';
import { useEditableData } from './_components/useEditableData';
import { pixilartItems } from '../data/pixilart';

export default function HomePage() {
  const { items } = useEditableData('pixilartItems', pixilartItems);

  return (
    <div className="space-y-6 pb-20">
      <PageHeader
        title="Pixilart"
        subtitle="原站的首頁以像素插畫與動畫呈現，重製後同樣保留多欄排版與循環動畫，並確保 GIF 能夠正常播放。"
      />
      <GalleryGrid items={items} columns={3} aspect="landscape" />
    </div>
  );
}
