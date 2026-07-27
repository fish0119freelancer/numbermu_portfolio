import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  DATA_DEFINITIONS,
  formatDataModule,
} from '../lib/github-content.mjs';

const HEAD_SHA = 'a'.repeat(40);
const TREE_SHA = 'b'.repeat(40);
const datasets = {
  pixilartItems: [],
  artItems: [],
  typeItems: [],
  workItems: [],
  profileData: {
    name: 'Remote profile',
    headline: '',
    avatar: '/images/avatar.jpg',
    email: '',
    bio: [],
    links: [],
  },
};

function createReadOnlyGitHubFetch() {
  const blobSources = new Map();
  const entries = Object.entries(DATA_DEFINITIONS).map(
    ([key, definition], index) => {
      const sha = (index + 1).toString(16).padStart(40, '0');
      blobSources.set(
        sha,
        formatDataModule(definition.exportName, datasets[key]),
      );
      return {
        path: definition.file,
        mode: '100644',
        type: 'blob',
        sha,
      };
    },
  );
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const path = new URL(url).pathname.replace(
      '/repos/fish0119freelancer/numbermu_portfolio',
      '',
    );
    const method = options.method || 'GET';
    calls.push({ method, path });
    const respond = (body, status = 200) =>
      new Response(JSON.stringify(body), { status });

    if (method === 'GET' && path === '/git/ref/heads/main') {
      return respond({ object: { sha: HEAD_SHA } });
    }
    if (method === 'GET' && path === `/git/commits/${HEAD_SHA}`) {
      return respond({ tree: { sha: TREE_SHA } });
    }
    if (method === 'GET' && path === `/git/trees/${TREE_SHA}`) {
      return respond({ tree: entries, truncated: false });
    }
    if (method === 'GET' && path.startsWith('/git/blobs/')) {
      const source = blobSources.get(path.split('/').at(-1));
      return respond({
        encoding: 'base64',
        content: Buffer.from(source, 'utf8').toString('base64'),
      });
    }
    return respond({ message: `Unexpected ${method} ${path}` }, 500);
  };
  return { fetchImpl, calls };
}

process.env.ADMIN_API_TOKEN = 'test-admin-token';
process.env.GIT_PUSH_TOKEN = 'test-github-token';
delete process.env.GITHUB_REPOSITORY;
delete process.env.RENDER_DEPLOY_HOOK_URL;
delete process.env.DEPLOY_HOOK_URL;

const route = await import('../app/api/content/route.js');
const versionRoute = await import('../app/api/version/route.js');

const request = (method, { token = 'test-admin-token', body } = {}) =>
  new Request('http://localhost/api/content', {
    method,
    headers: {
      'x-admin-token': token,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

test('route source contains no local Git or filesystem mutation primitives', async () => {
  const source = await readFile(
    new URL('../app/api/content/route.js', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(
    source,
    /child_process|execFile|writeFile|rename\(|runGit|gitQueue|git\s+(?:add|commit|push|rebase)/,
  );
});

test('GET returns authoritative data/headSha and requires authentication', async () => {
  const mock = createReadOnlyGitHubFetch();
  globalThis.fetch = mock.fetchImpl;

  const unauthorized = await route.GET(request('GET', { token: 'wrong' }));
  assert.equal(unauthorized.status, 401);

  const response = await route.GET(request('GET'));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.headSha, HEAD_SHA);
  assert.deepEqual(payload.data.pixilartItems, []);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('bad tokens do not consume the authenticated rate-limit budget', async () => {
  const mock = createReadOnlyGitHubFetch();
  globalThis.fetch = mock.fetchImpl;
  for (let index = 0; index < 12; index += 1) {
    const response = await route.GET(request('GET', { token: `wrong-${index}` }));
    assert.equal(response.status, 401);
  }
  const valid = await route.GET(request('GET'));
  assert.equal(valid.status, 200);
});

test('POST accepts the panels contract and returns authoritative unchanged data', async () => {
  const mock = createReadOnlyGitHubFetch();
  globalThis.fetch = mock.fetchImpl;
  const response = await route.POST(
    request('POST', {
      body: {
        baseSha: HEAD_SHA,
        panels: { pixilartItems: [] },
      },
    }),
  );
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.status, 'unchanged');
  assert.equal(payload.headSha, HEAD_SHA);
  assert.deepEqual(payload.data.pixilartItems, []);
  assert.equal(mock.calls.some((call) => call.method !== 'GET'), false);
});

test('POST rejects missing base SHA, malformed panels, and invalid content', async () => {
  let response = await route.POST(
    request('POST', { body: { panels: { pixilartItems: [] } } }),
  );
  assert.equal(response.status, 428);

  response = await route.POST(
    request('POST', { body: { baseSha: HEAD_SHA, panels: [] } }),
  );
  assert.equal(response.status, 400);

  response = await route.POST(
    request('POST', {
      body: {
        baseSha: HEAD_SHA,
        panels: { pixilartItems: [{ image: 'javascript:alert(1)' }] },
      },
    }),
  );
  assert.equal(response.status, 422);
});

test('POST stops an oversized streaming body even without Content-Length', async () => {
  const tenMiB = new Uint8Array(10 * 1024 * 1024);
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(tenMiB);
      controller.enqueue(tenMiB);
      controller.close();
    },
  });
  const response = await route.POST({
    headers: new Headers({ 'x-admin-token': 'test-admin-token' }),
    body,
  });
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error, 'payload_too_large');
});

test('version endpoint exposes only the deployed commit SHA without caching', async () => {
  const deployedSha = 'd'.repeat(40);
  process.env.RENDER_GIT_COMMIT = deployedSha;
  const response = await versionRoute.GET();
  assert.deepEqual(await response.json(), { commitSha: deployedSha });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  delete process.env.RENDER_GIT_COMMIT;
});
