export const SUPPORTED_IMAGE_MIME_TYPES = Object.freeze([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

export const IMAGE_ACCEPT = SUPPORTED_IMAGE_MIME_TYPES.join(',');
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_SAVE_IMAGE_BYTES = 12 * 1024 * 1024;
export const DEFAULT_REQUEST_TIMEOUT_MS = 90_000;

export class AdminRequestError extends Error {
  constructor(message, { status = 0, payload = null, code = 'request_failed' } = {}) {
    super(message);
    this.name = 'AdminRequestError';
    this.status = status;
    this.payload = payload;
    this.code = code;
    this.isConflict = status === 409 || code === 'conflict';
  }
}

const uniqueStrings = (values) =>
  [...new Set(values.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim()))];

export function formatAdminError(payload, status, fallback = '更新失敗，請稍後再試。') {
  const details = uniqueStrings([payload?.message, payload?.error, payload?.detail]);
  let guidance = '';

  if (status === 409 || payload?.status === 'conflict') {
    guidance = '遠端內容已被更新。草稿仍保留；請先載入遠端最新版，再重新套用變更。';
  } else if (status === 401) {
    guidance = '請確認 API Token 是否正確。';
  } else if (status === 413) {
    guidance = '上傳內容過大；單張圖片上限 4 MiB，每次儲存圖片總量上限 12 MiB。';
  } else if (status === 429) {
    guidance = '操作過於頻繁，請稍候再試。';
  } else if (status >= 500) {
    guidance = '伺服器暫時無法完成操作，草稿尚未遺失。';
  }

  return uniqueStrings([...details, guidance]).join(' ') || fallback;
}

export function validateImageFile(file) {
  if (!file || typeof file !== 'object') {
    return { ok: false, message: '請先選擇圖片檔案。' };
  }
  if (!SUPPORTED_IMAGE_MIME_TYPES.includes(file.type)) {
    return {
      ok: false,
      message: '不支援此圖片格式。請使用 PNG、JPEG、GIF 或 WebP。',
    };
  }
  if (!Number.isFinite(file.size) || file.size < 0) {
    return { ok: false, message: '無法判斷圖片大小，請重新選擇檔案。' };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      message: `圖片大小不可超過 4 MiB（目前約 ${(file.size / 1024 / 1024).toFixed(2)} MiB）。`,
    };
  }
  return { ok: true };
}

export function decodedDataUrlBytes(value) {
  if (typeof value !== 'string') return 0;
  const match = /^data:image\/[^;,]+;base64,([A-Za-z0-9+/]*={0,2})$/.exec(value);
  if (!match) return 0;
  const base64 = match[1];
  if (!base64) return 0;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

export function totalInlineImageBytes(value) {
  let total = 0;
  const visit = (current) => {
    if (typeof current === 'string') {
      total += decodedDataUrlBytes(current);
      return;
    }
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    if (current && typeof current === 'object') {
      Object.values(current).forEach(visit);
    }
  };
  visit(value);
  return total;
}

export function validateSaveImageTotal(value) {
  const totalBytes = totalInlineImageBytes(value);
  if (totalBytes > MAX_SAVE_IMAGE_BYTES) {
    return {
      ok: false,
      totalBytes,
      message: `這次儲存包含約 ${(totalBytes / 1024 / 1024).toFixed(2)} MiB 圖片，超過 12 MiB 上限。請分次儲存。`,
    };
  }
  return { ok: true, totalBytes };
}

export async function fetchJsonWithTimeout(
  url,
  options = {},
  {
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    fetchImpl = globalThis.fetch,
  } = {},
) {
  if (typeof fetchImpl !== 'function') {
    throw new AdminRequestError('瀏覽器不支援網路請求。', { code: 'fetch_unavailable' });
  }

  const controller = new AbortController();
  let didTimeout = false;
  const timer = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (didTimeout || error?.name === 'AbortError') {
      throw new AdminRequestError('請求逾時，草稿仍保留，請稍後重試。', {
        code: 'timeout',
      });
    }
    throw new AdminRequestError(`無法連線到伺服器：${error?.message || '未知錯誤'}`, {
      code: 'network_error',
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export function selectAuthoritativeValue(payload, storageKey, kind = 'array') {
  const value = payload?.data?.[storageKey];
  const valid =
    kind === 'array'
      ? Array.isArray(value)
      : kind === 'object'
        ? value !== null && typeof value === 'object' && !Array.isArray(value)
        : value !== undefined;
  return valid ? value : undefined;
}

export function shouldReplaceRemoteDataset(storageKey, replaceKeys) {
  return (
    replaceKeys === null ||
    replaceKeys === undefined ||
    replaceKeys.includes(storageKey)
  );
}

export function describeSaveResult(result) {
  if (result?.status === 'unchanged') {
    return {
      type: 'success',
      message: 'GitHub 內容已經一致，不需要建立新的 commit。',
    };
  }
  if (result?.deploy?.status === 'deploy_hook_failed') {
    return {
      type: 'warning',
      message:
        '內容已保存到 GitHub，但 Render 部署觸發失敗；系統會繼續確認公開網站版本。',
    };
  }
  if (result?.deploy?.status === 'deploy_triggered') {
    return {
      type: 'info',
      message: '內容已保存到 GitHub，Render 部署已觸發，正在等待公開網站更新。',
    };
  }
  return {
    type: 'info',
    message: '內容已保存到 GitHub，正在等待 Render 自動部署。',
  };
}

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function waitForDeployment(
  commitSha,
  {
    timeoutMs = 240_000,
    pollIntervalMs = 3_000,
    fetchImpl = globalThis.fetch,
  } = {},
) {
  if (!/^[a-f0-9]{40}$/i.test(commitSha || '')) {
    return { deployed: false, reason: 'invalid_commit' };
  }
  const deadline = Date.now() + timeoutMs;
  let lastCommitSha = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetchJsonWithTimeout(
        '/api/version',
        { method: 'GET', cache: 'no-store' },
        {
          timeoutMs: Math.min(5_000, Math.max(100, deadline - Date.now())),
          fetchImpl,
        },
      );
      const payload = await readJsonResponse(response);
      lastCommitSha = payload?.commitSha || null;
      if (response.ok && lastCommitSha === commitSha) {
        return { deployed: true, commitSha };
      }
    } catch {
      // A deployment briefly replacing the instance can interrupt a poll.
    }
    const remaining = deadline - Date.now();
    if (remaining > 0) {
      await delay(Math.min(pollIntervalMs, remaining));
    }
  }

  return { deployed: false, reason: 'timeout', lastCommitSha };
}
