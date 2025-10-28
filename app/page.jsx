'use client';

import PixilartSlider from './_components/PixilartSlider';
import { useEditableData } from './_components/useEditableData';
import { pixilartItems } from '../data/pixilart';

export default function HomePage() {
  const { items } = useEditableData('pixilartItems', pixilartItems);

  return <PixilartSlider items={items} />;
}
