'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  AdminRequestError,
  fetchJsonWithTimeout,
  formatAdminError,
  readJsonResponse,
  selectAuthoritativeValue,
  shouldReplaceRemoteDataset,
  validateSaveImageTotal,
} from '../../lib/admin-client.mjs';

const remoteListeners = new Set();
let remoteSnapshot = { data: null, headSha: null };
let pendingReload = null;
let activeSave = null;

const isValidByKind = (value, kind) => {
  if (kind === 'array') return Array.isArray(value);
  if (kind === 'object') {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
  return value !== undefined;
};

const cloneValue = (value) => {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
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

const publishRemote = (payload, { replaceKeys = null } = {}) => {
  if (!payload?.data || typeof payload.data !== 'object' || !payload?.headSha) {
    throw new AdminRequestError('伺服器沒有回傳完整的權威內容，草稿仍保留。', {
      code: 'invalid_response',
      payload,
    });
  }
  const previousData = remoteSnapshot.data;
  const changedKeys = Object.keys(payload.data).filter((key) => {
    if (!previousData || previousData[key] === undefined) return true;
    try {
      return JSON.stringify(previousData[key]) !== JSON.stringify(payload.data[key]);
    } catch {
      return true;
    }
  });
  remoteSnapshot = { data: payload.data, headSha: payload.headSha };
  const event = { ...remoteSnapshot, replaceKeys, changedKeys };
  remoteListeners.forEach((listener) => listener(event));
};

const requestRemoteContent = async ({ token, timeoutMs, replaceKeys = null } = {}) => {
  const resolvedToken = token || getStoredToken();
  if (!resolvedToken) {
    throw new AdminRequestError('請先輸入 API Token，再載入遠端內容。', {
      status: 401,
      code: 'missing_token',
    });
  }

  if (pendingReload) {
    const result = await pendingReload;
    // A concurrent panel may have requested a different replacement scope.
    // Re-publish the same authoritative snapshot so that panel can clear its
    // own conflict without issuing a duplicate GitHub request.
    publishRemote(result, { replaceKeys });
    return result;
  }

  pendingReload = (async () => {
    const response = await fetchJsonWithTimeout(
      '/api/content',
      {
        method: 'GET',
        headers: { 'x-admin-token': resolvedToken },
        cache: 'no-store',
      },
      { timeoutMs },
    );
    const result = await readJsonResponse(response);
    if (!response.ok) {
      throw new AdminRequestError(
        formatAdminError(result, response.status, '無法載入遠端內容。'),
        {
          status: response.status,
          payload: result,
          code: result?.status || 'load_failed',
        },
      );
    }
    publishRemote(result, { replaceKeys });
    return result;
  })();

  try {
    return await pendingReload;
  } finally {
    pendingReload = null;
  }
};

export function useEditableData(storageKey, initialData, kind = 'array', config = {}) {
  const [items, setItems] = useState(initialData);
  const [headSha, setHeadSha] = useState(remoteSnapshot.headSha);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const headShaRef = useRef(remoteSnapshot.headSha);
  const remoteConflictRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const receiveRemote = (snapshot) => {
      const authoritative = selectAuthoritativeValue({ data: snapshot.data }, storageKey, kind);
      if (!isValidByKind(authoritative, kind)) return;
      headShaRef.current = snapshot.headSha;
      setHeadSha(snapshot.headSha);
      const shouldReplace = shouldReplaceRemoteDataset(
        storageKey,
        snapshot.replaceKeys,
      );
      if (shouldReplace) {
        remoteConflictRef.current = false;
        setItems(authoritative);
        setLoadError(null);
      } else if (snapshot.changedKeys?.includes(storageKey)) {
        remoteConflictRef.current = true;
        setLoadError(
          new AdminRequestError(
            'GitHub 上的這個區塊已有新版本；目前草稿仍保留，請先在此區塊載入最新版。',
            { status: 409, code: 'remote_panel_changed' },
          ),
        );
      }
    };
    remoteListeners.add(receiveRemote);
    if (remoteSnapshot.data) receiveRemote(remoteSnapshot);
    return () => {
      mountedRef.current = false;
      remoteListeners.delete(receiveRemote);
    };
  }, [kind, storageKey]);

  useEffect(() => {
    if (!config.token?.trim()) return undefined;
    let cancelled = false;
    setLoading(true);
    requestRemoteContent({ token: config.token, timeoutMs: config.timeoutMs })
      .catch((error) => {
        if (!cancelled) setLoadError(error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [config.timeoutMs, config.token]);

  const reload = useCallback(async (options = {}) => {
    setLoading(true);
    setLoadError(null);
    try {
      return await requestRemoteContent({
        ...options,
        replaceKeys: options.replaceAll ? null : [storageKey],
      });
    } catch (error) {
      if (mountedRef.current) setLoadError(error);
      throw error;
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [storageKey]);

  const reset = useCallback(() => cloneValue(initialData), [initialData]);

  const persist = useCallback(
    async (nextItems, options = {}) => {
      if (!isValidByKind(nextItems, kind)) {
        throw new AdminRequestError(`Invalid payload for ${storageKey}. Expected ${kind}.`, {
          code: 'invalid_payload',
        });
      }

      const imageTotal = validateSaveImageTotal(nextItems);
      if (!imageTotal.ok) {
        throw new AdminRequestError(imageTotal.message, { code: 'payload_too_large' });
      }

      if (activeSave) {
        throw new AdminRequestError('另一項內容正在儲存，請等待完成後再試。', {
          code: 'save_in_progress',
        });
      }

      const resolvedToken = options.token || getStoredToken();
      if (!resolvedToken) {
        throw new AdminRequestError('請先輸入 API Token。', {
          status: 401,
          code: 'missing_token',
        });
      }
      if (!headShaRef.current) {
        throw new AdminRequestError('尚未載入 GitHub 最新版本，請先載入遠端內容。', {
          code: 'missing_base_sha',
        });
      }
      if (remoteConflictRef.current) {
        throw new AdminRequestError(
          '這個區塊的遠端內容已更新。請先載入最新版；目前草稿仍保留。',
          { status: 409, code: 'remote_panel_changed' },
        );
      }

      const body = {
        panels: { [storageKey]: nextItems },
        baseSha: headShaRef.current,
      };
      if (typeof options.commitMessage === 'string' && options.commitMessage.trim()) {
        body.commitMessage = options.commitMessage.trim();
      }

      activeSave = (async () => {
        const response = await fetchJsonWithTimeout(
          '/api/content',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-admin-token': resolvedToken,
            },
            body: JSON.stringify(body),
          },
          { timeoutMs: options.timeoutMs },
        );
        const result = await readJsonResponse(response);
        if (!response.ok) {
          throw new AdminRequestError(
            formatAdminError(result, response.status, `Failed to persist ${storageKey}.`),
            {
              status: response.status,
              payload: result,
              code: result?.status || 'save_failed',
            },
          );
        }

        const authoritative = selectAuthoritativeValue(result, storageKey, kind);
        if (!isValidByKind(authoritative, kind)) {
          throw new AdminRequestError(
            '內容可能已儲存，但伺服器沒有回傳可驗證的正式資料；請載入遠端最新版確認。',
            { code: 'invalid_response', payload: result },
          );
        }
        publishRemote(result, { replaceKeys: [storageKey] });
        return result;
      })();

      try {
        return await activeSave;
      } finally {
        activeSave = null;
      }
    },
    [kind, storageKey],
  );

  return {
    items,
    setItems: persist,
    reset,
    reload,
    headSha,
    loading,
    loadError,
  };
}
