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

const getStoredToken = () => {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage.getItem('adminApiToken') || undefined;
  } catch (error) {
    console.warn('[useEditableData] unable to read admin token', error);
    return undefined;
  }
};

export function useEditableData(storageKey, initialData, kind = 'array') {
  const [items, setItems] = useState(initialData);

  useEffect(() => {
    setItems(initialData);
  }, [initialData]);

  const reset = useCallback(() => {
    setItems(initialData);
  }, [initialData]);

  const persist = useCallback(
    async (nextItems, options = {}) => {
      if (!isValidByKind(nextItems, kind)) {
        throw new Error(`Invalid payload for ${storageKey}. Expected ${kind}.`);
      }

      const body = {
        [storageKey]: nextItems,
      };

      if (typeof options.commitMessage === 'string' && options.commitMessage.trim()) {
        body.commitMessage = options.commitMessage.trim();
      }

      const resolvedToken = options.token || getStoredToken();
      const headers = { 'Content-Type': 'application/json' };
      if (resolvedToken) {
        headers['x-admin-token'] = resolvedToken;
      }

      const response = await fetch('/api/content', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      let result = {};
      try {
        result = await response.json();
      } catch (error) {
        // ignore JSON parsing errors, will handle via status
      }

      if (!response.ok) {
        const message =
          result?.error || `Failed to persist ${storageKey}. Status ${response.status}.`;
        throw new Error(message);
      }

      setItems(nextItems);
      return result;
    },
    [kind, storageKey],
  );

  return { items, setItems: persist, reset };
}
