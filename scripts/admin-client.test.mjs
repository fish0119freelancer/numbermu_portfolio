import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AdminRequestError,
  IMAGE_ACCEPT,
  MAX_IMAGE_BYTES,
  MAX_SAVE_IMAGE_BYTES,
  decodedDataUrlBytes,
  describeSaveResult,
  fetchJsonWithTimeout,
  formatAdminError,
  selectAuthoritativeValue,
  shouldReplaceRemoteDataset,
  totalInlineImageBytes,
  validateImageFile,
  validateSaveImageTotal,
  waitForDeployment,
} from '../lib/admin-client.mjs';

test('image accept list is restricted to the four server-supported formats', () => {
  assert.equal(IMAGE_ACCEPT, 'image/png,image/jpeg,image/gif,image/webp');
});

test('file validation accepts exact 4 MiB and rejects one byte over', () => {
  assert.deepEqual(validateImageFile({ type: 'image/gif', size: MAX_IMAGE_BYTES }), {
    ok: true,
  });
  assert.equal(validateImageFile({ type: 'image/gif', size: MAX_IMAGE_BYTES + 1 }).ok, false);
  assert.equal(validateImageFile({ type: 'image/svg+xml', size: 100 }).ok, false);
});

test('inline image accounting handles nested payloads and exact 12 MiB boundary', () => {
  const encoded4MiB = `data:image/png;base64,${Buffer.alloc(MAX_IMAGE_BYTES).toString('base64')}`;
  assert.equal(decodedDataUrlBytes(encoded4MiB), MAX_IMAGE_BYTES);
  const exact = [encoded4MiB, { image: encoded4MiB }, { images: [encoded4MiB] }];
  assert.equal(totalInlineImageBytes(exact), MAX_SAVE_IMAGE_BYTES);
  assert.equal(validateSaveImageTotal(exact).ok, true);
  assert.equal(
    validateSaveImageTotal([...exact, 'data:image/png;base64,AAAA']).ok,
    false,
  );
});

test('error formatting preserves server context and adds status guidance', () => {
  const message = formatAdminError(
    { message: 'Push failed.', error: 'github_error', detail: 'Rate limited.' },
    502,
  );
  assert.match(message, /Push failed/);
  assert.match(message, /github_error/);
  assert.match(message, /Rate limited/);
  assert.match(message, /草稿尚未遺失/);

  assert.match(formatAdminError({ status: 'conflict' }, 409), /草稿仍保留/);
});

test('timeout aborts the request and returns a typed error', async () => {
  const neverResolves = (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    });

  await assert.rejects(
    fetchJsonWithTimeout('/api/content', {}, { timeoutMs: 5, fetchImpl: neverResolves }),
    (error) => error instanceof AdminRequestError && error.code === 'timeout',
  );
});

test('authoritative response selection never falls back to submitted draft', () => {
  const remote = [{ image: '/images/content/remote.png' }];
  assert.equal(selectAuthoritativeValue({ data: { artItems: remote } }, 'artItems'), remote);
  assert.equal(selectAuthoritativeValue({ data: {} }, 'artItems'), undefined);
  assert.equal(
    selectAuthoritativeValue({ data: { profileData: { name: 'Remote' } } }, 'profileData', 'object')
      .name,
    'Remote',
  );
});

test('save result copy distinguishes deploy failure from completed persistence', () => {
  assert.equal(
    describeSaveResult({
      status: 'saved',
      deploy: { status: 'deploy_hook_failed' },
    }).type,
    'warning',
  );
  assert.match(
    describeSaveResult({
      status: 'saved',
      deploy: { status: 'deploy_triggered' },
    }).message,
    /Render/,
  );
  assert.equal(describeSaveResult({ status: 'unchanged' }).type, 'success');
});

test('deployment polling waits until Render reports the committed SHA', async () => {
  const target = 'a'.repeat(40);
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response(
      JSON.stringify({
        commitSha: calls === 1 ? 'b'.repeat(40) : target,
      }),
      { status: 200 },
    );
  };
  const result = await waitForDeployment(target, {
    timeoutMs: 100,
    pollIntervalMs: 1,
    fetchImpl,
  });
  assert.equal(result.deployed, true);
  assert.equal(calls, 2);
});

test('saving one panel does not replace drafts from unrelated panels', () => {
  assert.equal(
    shouldReplaceRemoteDataset('pixilartItems', ['pixilartItems']),
    true,
  );
  assert.equal(shouldReplaceRemoteDataset('artItems', ['pixilartItems']), false);
  assert.equal(shouldReplaceRemoteDataset('artItems', null), true);
});
