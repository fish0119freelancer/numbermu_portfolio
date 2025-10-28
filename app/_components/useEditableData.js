'use client';

import { useCallback, useEffect, useState } from 'react';

const isValidByKind = (value, kind) => {
  if (kind === 'array') {
    return Array.isArray(value);
  }
  if (kind === 'object') {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
  return value !== undefined;
};

export function useEditableData(storageKey, initialData, kind = 'array') {
  const [items, setItems] = useState(initialData);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const load = () => {
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (isValidByKind(parsed, kind)) {
          setItems(parsed);
        }
      } catch (error) {
        console.warn(`[useEditableData] 無法解析 ${storageKey}`, error);
      }
    };

    load();

    const handleStorage = (event) => {
      if (event.key === storageKey) {
        load();
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [storageKey]);

  const persist = useCallback((nextItems) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(storageKey, JSON.stringify(nextItems));
    setItems(nextItems);
  }, [storageKey]);

  const reset = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(storageKey);
    setItems(initialData);
  }, [initialData, kind, storageKey]);

  return { items, setItems: persist, reset };
}
