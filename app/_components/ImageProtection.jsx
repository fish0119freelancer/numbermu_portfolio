'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { hasImageUrlBackground, isAdminPath } from '../../lib/image-protection.mjs';

const PROTECTED_SURFACE_SELECTOR = 'img, picture, [data-image-protected]';
const BACKGROUND_MARKER = 'data-image-protection-background';

function findProtectedSurface(target) {
  if (!(target instanceof Element)) return null;

  const explicitSurface = target.closest(PROTECTED_SURFACE_SELECTOR);
  if (explicitSurface) return explicitSurface;

  return target.hasAttribute(BACKGROUND_MARKER) ||
    hasImageUrlBackground(getComputedStyle(target).backgroundImage)
    ? target
    : null;
}

export default function ImageProtection() {
  const pathname = usePathname();

  useEffect(() => {
    if (isAdminPath(pathname)) return undefined;

    const root = document.documentElement;
    const originalDraggable = new Map();
    const ownedBackgroundMarkers = new Set();

    root.setAttribute('data-image-protection', 'enabled');

    const protectImage = (image) => {
      if (!originalDraggable.has(image)) {
        originalDraggable.set(image, image.getAttribute('draggable'));
      }
      image.setAttribute('draggable', 'false');
    };

    const syncBackgroundMarker = (element) => {
      const hasImageBackground = hasImageUrlBackground(
        getComputedStyle(element).backgroundImage,
      );

      if (hasImageBackground && !element.hasAttribute(BACKGROUND_MARKER)) {
        element.setAttribute(BACKGROUND_MARKER, '');
        ownedBackgroundMarkers.add(element);
      } else if (!hasImageBackground && ownedBackgroundMarkers.has(element)) {
        element.removeAttribute(BACKGROUND_MARKER);
        ownedBackgroundMarkers.delete(element);
      }
    };

    const syncElement = (element) => {
      if (element.matches('img')) protectImage(element);
      syncBackgroundMarker(element);
    };

    const syncTree = (node) => {
      if (!(node instanceof Element)) return;
      syncElement(node);
      node.querySelectorAll('*').forEach(syncElement);
    };

    syncTree(root);

    const observer = new MutationObserver((records) => {
      records.forEach((record) => {
        if (record.type === 'attributes') {
          syncTree(record.target);
        } else {
          record.addedNodes.forEach(syncTree);
        }
      });
    });
    observer.observe(root, {
      attributeFilter: ['class', 'style'],
      attributes: true,
      childList: true,
      subtree: true,
    });

    const preventOnProtectedSurface = (event) => {
      if (findProtectedSurface(event.target)) event.preventDefault();
    };

    document.addEventListener('contextmenu', preventOnProtectedSurface, true);
    document.addEventListener('dragstart', preventOnProtectedSurface, true);

    return () => {
      observer.disconnect();
      document.removeEventListener('contextmenu', preventOnProtectedSurface, true);
      document.removeEventListener('dragstart', preventOnProtectedSurface, true);
      root.removeAttribute('data-image-protection');

      originalDraggable.forEach((value, image) => {
        if (value === null) image.removeAttribute('draggable');
        else image.setAttribute('draggable', value);
      });
      ownedBackgroundMarkers.forEach((element) => {
        element.removeAttribute(BACKGROUND_MARKER);
      });
    };
  }, [pathname]);

  return null;
}
