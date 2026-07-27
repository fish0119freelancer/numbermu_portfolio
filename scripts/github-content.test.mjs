import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DATA_DEFINITIONS,
  GitHubContentError,
  createGitHubContentService,
  formatDataModule,
  parseDataModule,
  redactSecrets,
  resolveGitHubConfig,
} from '../lib/github-content.mjs';

const sha = (char) => char.repeat(40);

function createRepositoryMock({
  pixilart = [],
  art = [],
  failPatchStatus = null,
} = {}) {
  const datasets = {
    pixilartItems: pixilart,
    artItems: art,
    typeItems: [],
    workItems: [],
    profileData: {
      name: 'numbermuu',
      headline: '',
      avatar: '/images/avatar.jpg',
      email: '',
      bio: [],
      links: [],
    },
  };
  const blobContent = new Map();
  const treeEntries = [];
  let nextShaNumber = 16;
  const freshSha = () => (nextShaNumber++).toString(16).padStart(40, '0');

  for (const [key, definition] of Object.entries(DATA_DEFINITIONS)) {
    const blobSha = freshSha();
    blobContent.set(
      blobSha,
      formatDataModule(definition.exportName, datasets[key]),
    );
    treeEntries.push({
      path: definition.file,
      mode: '100644',
      type: 'blob',
      sha: blobSha,
    });
  }

  const initialHead = sha('a');
  const initialTree = sha('b');
  const state = {
    head: initialHead,
    tree: initialTree,
    commits: new Map([[initialHead, { tree: { sha: initialTree } }]]),
    trees: new Map([[initialTree, treeEntries]]),
    blobs: blobContent,
    requests: [],
    lastTreeRequest: null,
  };

  const jsonResponse = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(
      '/repos/fish0119freelancer/numbermu_portfolio',
      '',
    );
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : undefined;
    state.requests.push({ method, path, body });

    if (method === 'GET' && path === '/git/ref/heads/main') {
      return jsonResponse({ object: { sha: state.head } });
    }
    if (method === 'GET' && path.startsWith('/git/commits/')) {
      return jsonResponse(state.commits.get(path.split('/').at(-1)));
    }
    if (method === 'GET' && path.startsWith('/git/trees/')) {
      const treeSha = path.split('/').at(-1);
      return jsonResponse({ tree: state.trees.get(treeSha), truncated: false });
    }
    if (method === 'GET' && path.startsWith('/git/blobs/')) {
      const content = state.blobs.get(path.split('/').at(-1));
      return jsonResponse({
        encoding: 'base64',
        content: Buffer.from(content, 'utf8').toString('base64'),
      });
    }
    if (method === 'POST' && path === '/git/blobs') {
      const blobSha = freshSha();
      const decoded =
        body.encoding === 'base64'
          ? Buffer.from(body.content, 'base64')
          : Buffer.from(body.content, 'utf8');
      state.blobs.set(blobSha, decoded.toString('utf8'));
      return jsonResponse({ sha: blobSha }, 201);
    }
    if (method === 'POST' && path === '/git/trees') {
      const treeSha = freshSha();
      const base = state.trees.get(body.base_tree).map((entry) => ({ ...entry }));
      for (const update of body.tree) {
        const index = base.findIndex((entry) => entry.path === update.path);
        if (update.sha === null) {
          if (index >= 0) base.splice(index, 1);
        } else if (index >= 0) {
          base[index] = update;
        } else {
          base.push(update);
        }
      }
      state.lastTreeRequest = body.tree;
      state.trees.set(treeSha, base);
      return jsonResponse({ sha: treeSha }, 201);
    }
    if (method === 'POST' && path === '/git/commits') {
      const commitSha = freshSha();
      state.commits.set(commitSha, { tree: { sha: body.tree } });
      return jsonResponse({ sha: commitSha }, 201);
    }
    if (method === 'PATCH' && path === '/git/refs/heads/main') {
      if (failPatchStatus) {
        return jsonResponse({ message: 'Reference update rejected' }, failPatchStatus);
      }
      if (!state.commits.has(body.sha)) {
        return jsonResponse({ message: 'Unknown commit' }, 422);
      }
      state.head = body.sha;
      state.tree = state.commits.get(body.sha).tree.sha;
      return jsonResponse({ object: { sha: body.sha } });
    }

    return jsonResponse({ message: `${method} ${path} not mocked` }, 500);
  };

  return { state, fetchImpl, initialHead };
}

const makeService = (fetchImpl, timeoutMs = 1_000) =>
  createGitHubContentService({
    config: {
      token: 'github-secret-token',
      repository: 'fish0119freelancer/numbermu_portfolio',
      branch: 'main',
    },
    fetchImpl,
    timeoutMs,
  });

test('configuration supports existing token and project repository fallback', () => {
  assert.deepEqual(resolveGitHubConfig({ GIT_PUSH_TOKEN: 'token' }), {
    token: 'token',
    repository: 'fish0119freelancer/numbermu_portfolio',
    branch: 'main',
  });
  assert.throws(
    () => resolveGitHubConfig({ GITHUB_REPOSITORY: 'bad repo' }),
    (error) => error instanceof GitHubContentError && error.code === 'github_config',
  );
});

test('data modules round-trip pure JSON and reject executable source', () => {
  const value = [{ title: '中文 😀', image: '/images/example.png' }];
  const source = formatDataModule('items', value);
  assert.deepEqual(parseDataModule(source, 'items'), value);
  assert.throws(() => parseDataModule('export const items = process.env;\n', 'items'));
});

test('secret redaction removes raw, URL-encoded, and URL-userinfo credentials', () => {
  const secret = 'abc+123';
  const value = `raw=${secret} encoded=${encodeURIComponent(secret)} https://${secret}@github.com/x/y`;
  const redacted = redactSecrets(value, [secret]);
  assert.equal(redacted.includes(secret), false);
  assert.equal(redacted.includes(encodeURIComponent(secret)), false);
});

test('readSnapshot returns all authoritative datasets and the branch SHA', async () => {
  const { fetchImpl, initialHead } = createRepositoryMock({
    pixilart: [{ slug: 'remote', image: '/images/remote.gif' }],
  });
  const snapshot = await makeService(fetchImpl).readSnapshot();
  assert.equal(snapshot.headSha, initialHead);
  assert.equal(snapshot.datasets.pixilartItems[0].slug, 'remote');
  assert.equal(Object.keys(snapshot.datasets).length, 5);
});

test('readSnapshot rejects remote JSON that violates the content schema', async () => {
  const repository = createRepositoryMock();
  const pixilartEntry = repository.state.trees
    .get(repository.state.tree)
    .find((entry) => entry.path === DATA_DEFINITIONS.pixilartItems.file);
  repository.state.blobs.set(
    pixilartEntry.sha,
    formatDataModule(DATA_DEFINITIONS.pixilartItems.exportName, [
      { image: 'javascript:alert(1)' },
    ]),
  );
  await assert.rejects(
    makeService(repository.fetchImpl).readSnapshot(),
    (error) =>
      error instanceof GitHubContentError &&
      error.code === 'invalid_remote_content',
  );
});

test('save creates one tree and commit then advances the ref without force', async () => {
  const { fetchImpl, state, initialHead } = createRepositoryMock();
  const result = await makeService(fetchImpl).save({
    baseSha: initialHead,
    updates: {
      pixilartItems: [{ slug: 'new', image: '/images/new.gif' }],
    },
    message: 'content update',
  });

  assert.equal(result.status, 'saved');
  assert.equal(state.head, result.commitSha);
  const patch = state.requests.find(
    (entry) => entry.method === 'PATCH' && entry.path === '/git/refs/heads/main',
  );
  assert.equal(patch.body.force, false);
  assert.equal(
    state.requests.filter((entry) => entry.method === 'POST' && entry.path === '/git/trees')
      .length,
    1,
  );
  assert.equal(
    state.requests.filter((entry) => entry.method === 'POST' && entry.path === '/git/commits')
      .length,
    1,
  );
});

test('unchanged content produces no tree, commit, or ref update', async () => {
  const { fetchImpl, state, initialHead } = createRepositoryMock();
  const result = await makeService(fetchImpl).save({
    baseSha: initialHead,
    updates: { pixilartItems: [] },
  });
  assert.equal(result.status, 'unchanged');
  assert.equal(
    state.requests.some((entry) => ['POST', 'PATCH'].includes(entry.method)),
    false,
  );
});

test('two saves from one base SHA allow exactly one winner', async () => {
  const { fetchImpl, initialHead } = createRepositoryMock();
  const service = makeService(fetchImpl);
  await service.save({
    baseSha: initialHead,
    updates: { pixilartItems: [{ slug: 'winner', image: '/images/a.gif' }] },
  });
  await assert.rejects(
    service.save({
      baseSha: initialHead,
      updates: { pixilartItems: [{ slug: 'loser', image: '/images/b.gif' }] },
    }),
    (error) =>
      error instanceof GitHubContentError &&
      error.status === 409 &&
      error.code === 'content_conflict',
  );
});

test('retry after a timeout is idempotent when the desired content already won', async () => {
  const { fetchImpl, initialHead } = createRepositoryMock();
  const service = makeService(fetchImpl);
  const desired = [{ slug: 'saved-on-first-attempt', image: '/images/a.gif' }];
  const first = await service.save({
    baseSha: initialHead,
    updates: { pixilartItems: desired },
  });
  const retry = await service.save({
    baseSha: initialHead,
    updates: { pixilartItems: desired },
  });
  assert.equal(first.status, 'saved');
  assert.equal(retry.status, 'unchanged');
  assert.equal(retry.baseSha, first.commitSha);
});

test('a ref race is translated to an actionable 409 conflict', async () => {
  const { fetchImpl, initialHead } = createRepositoryMock({ failPatchStatus: 422 });
  await assert.rejects(
    makeService(fetchImpl).save({
      baseSha: initialHead,
      updates: { pixilartItems: [{ slug: 'race', image: '/images/a.gif' }] },
    }),
    (error) =>
      error instanceof GitHubContentError &&
      error.status === 409 &&
      error.code === 'content_conflict',
  );
});

test('removed managed content images are deleted only when globally orphaned', async () => {
  const hash = '1'.repeat(64);
  const imageRef = `/images/content/${hash}.png`;
  const imagePath = `public${imageRef}`;
  const repository = createRepositoryMock({
    pixilart: [{ slug: 'remove-me', image: imageRef }],
  });
  repository.state.trees.get(repository.state.tree).push({
    path: imagePath,
    mode: '100644',
    type: 'blob',
    sha: sha('f'),
  });

  await makeService(repository.fetchImpl).save({
    baseSha: repository.initialHead,
    updates: { pixilartItems: [] },
  });
  assert.equal(
    repository.state.lastTreeRequest.some(
      (entry) => entry.path === imagePath && entry.sha === null,
    ),
    true,
  );
});

test('managed image shared by another dataset is never garbage-collected', async () => {
  const hash = '2'.repeat(64);
  const imageRef = `/images/content/${hash}.gif`;
  const imagePath = `public${imageRef}`;
  const repository = createRepositoryMock({
    pixilart: [{ slug: 'remove-me', image: imageRef }],
    art: [{ image: imageRef, caption: 'shared' }],
  });
  repository.state.trees.get(repository.state.tree).push({
    path: imagePath,
    mode: '100644',
    type: 'blob',
    sha: sha('e'),
  });

  await makeService(repository.fetchImpl).save({
    baseSha: repository.initialHead,
    updates: { pixilartItems: [] },
  });
  assert.equal(
    repository.state.lastTreeRequest.some(
      (entry) => entry.path === imagePath && entry.sha === null,
    ),
    false,
  );
});

test('network failures and timeouts are typed without leaking credentials', async () => {
  const networkFailure = async () => {
    throw new Error('socket failed for github-secret-token');
  };
  await assert.rejects(
    makeService(networkFailure).readSnapshot(),
    (error) =>
      error instanceof GitHubContentError &&
      error.code === 'github_network' &&
      !error.message.includes('github-secret-token'),
  );

  const waitsForAbort = (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    });
  await assert.rejects(
    makeService(waitsForAbort, 5).readSnapshot(),
    (error) => error instanceof GitHubContentError && error.code === 'github_timeout',
  );
});

test('GitHub HTTP failures are typed and rate limits remain actionable', async () => {
  for (const status of [401, 403, 404, 409, 422, 500]) {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ message: `failure ${status}` }), { status });
    await assert.rejects(
      makeService(fetchImpl).readSnapshot(),
      (error) =>
        error instanceof GitHubContentError &&
        error.code === `github_${status}` &&
        error.status === 502,
    );
  }

  const rateLimited = async () =>
    new Response(JSON.stringify({ message: 'rate limited' }), { status: 429 });
  await assert.rejects(
    makeService(rateLimited).readSnapshot(),
    (error) =>
      error instanceof GitHubContentError &&
      error.code === 'github_429' &&
      error.status === 429,
  );
});
