import crypto from 'crypto';

import { serializePureJson, validateContent } from './content-contract.mjs';

export const DATA_DEFINITIONS = {
  pixilartItems: { exportName: 'pixilartItems', file: 'data/pixilart.js' },
  artItems: { exportName: 'artItems', file: 'data/art.js' },
  typeItems: { exportName: 'typeItems', file: 'data/type.js' },
  workItems: { exportName: 'workItems', file: 'data/work.js' },
  profileData: { exportName: 'profile', file: 'data/about.js' },
};

const CONTENT_IMAGE_RE =
  /^public\/images\/content\/([a-f0-9]{64})\.(png|jpg|gif|webp)$/;
const CONTENT_IMAGE_REF_RE =
  /^\/images\/content\/([a-f0-9]{64})\.(png|jpg|gif|webp)$/;
const PROJECT_REPOSITORY = 'fish0119freelancer/numbermu_portfolio';

export class GitHubContentError extends Error {
  constructor(message, { status = 502, code = 'github_error', details } = {}) {
    super(message);
    this.name = 'GitHubContentError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function redactSecrets(input, secrets = []) {
  let output = String(input ?? '');
  for (const secret of secrets.filter(Boolean)) {
    output = output.split(secret).join('***');
    try {
      output = output.split(encodeURIComponent(secret)).join('***');
    } catch {
      // A malformed value should not prevent the remaining redaction rules.
    }
  }
  return output.replace(/(https?:\/\/)[^/@\s]+@/gi, '$1***@');
}

function parseRepository(value) {
  const candidate = String(value ?? '').trim();
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(candidate)) {
    return candidate.replace(/\.git$/i, '');
  }

  if (candidate) {
    try {
      const url = new URL(candidate);
      if (url.hostname.toLowerCase() === 'github.com') {
        const parts = url.pathname.replace(/^\/|\/$/g, '').split('/');
        if (parts.length === 2) {
          return `${parts[0]}/${parts[1].replace(/\.git$/i, '')}`;
        }
      }
    } catch {
      const ssh = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i.exec(candidate);
      if (ssh) return `${ssh[1]}/${ssh[2]}`;
    }
  }
  return null;
}

export function resolveGitHubConfig(env = process.env) {
  const token = env.GITHUB_TOKEN || env.GIT_PUSH_TOKEN;
  const configuredRepository = [
    env.GITHUB_REPOSITORY,
    env.GIT_REMOTE_URL,
    env.CONTENT_UPDATE_REMOTE_URL,
  ].find((value) => String(value ?? '').trim());
  const repository = configuredRepository
    ? parseRepository(configuredRepository)
    : PROJECT_REPOSITORY;
  const branch =
    env.GITHUB_BRANCH || env.CONTENT_UPDATE_BRANCH || env.RENDER_GIT_BRANCH || 'main';

  if (!token) {
    throw new GitHubContentError(
      'Server misconfiguration: GITHUB_TOKEN is not set.',
      { status: 500, code: 'github_config' },
    );
  }
  if (!repository) {
    throw new GitHubContentError(
      'Server misconfiguration: set GITHUB_REPOSITORY to owner/repository.',
      { status: 500, code: 'github_config' },
    );
  }
  if (!/^[A-Za-z0-9._/-]+$/.test(branch) || branch.startsWith('/') || branch.endsWith('/')) {
    throw new GitHubContentError(
      'Server misconfiguration: invalid GitHub branch name.',
      { status: 500, code: 'github_config' },
    );
  }

  return { token, repository, branch };
}

export function formatDataModule(exportName, value) {
  return `export const ${exportName} = ${serializePureJson(value)};\n`;
}

export function parseDataModule(source, exportName) {
  const prefix = `export const ${exportName} = `;
  if (!source.startsWith(prefix) || !source.endsWith(';\n')) {
    throw new GitHubContentError(
      `Remote module ${exportName} does not match the managed data format.`,
      { status: 502, code: 'invalid_remote_content' },
    );
  }
  const json = source.slice(prefix.length, -2);
  try {
    return JSON.parse(json);
  } catch {
    throw new GitHubContentError(
      `Remote module ${exportName} contains invalid JSON.`,
      { status: 502, code: 'invalid_remote_content' },
    );
  }
}

function encodeRefPath(branch) {
  return branch.split('/').map(encodeURIComponent).join('/');
}

function collectContentImageRefs(value, refs = new Set()) {
  if (typeof value === 'string') {
    if (CONTENT_IMAGE_REF_RE.test(value)) refs.add(`public${value}`);
    return refs;
  }
  if (Array.isArray(value)) {
    for (const child of value) collectContentImageRefs(child, refs);
    return refs;
  }
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) collectContentImageRefs(child, refs);
  }
  return refs;
}

function encodeBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

function isConflictStatus(status) {
  return status === 409 || status === 422;
}

export function createGitHubContentService({
  config,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15_000,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new GitHubContentError('Fetch is unavailable.', {
      status: 500,
      code: 'github_config',
    });
  }
  const resolved = config ?? resolveGitHubConfig();
  const { token, repository, branch } = resolved;
  const apiRoot = `https://api.github.com/repos/${repository}`;
  const secrets = [token];

  async function request(path, { method = 'GET', body, timeout = timeoutMs } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    let response;
    try {
      response = await fetchImpl(`${apiRoot}${path}`, {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'numbermu-content-service',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      const timedOut = error?.name === 'AbortError';
      throw new GitHubContentError(
        timedOut ? 'GitHub request timed out.' : 'Unable to reach GitHub.',
        {
          status: timedOut ? 504 : 502,
          code: timedOut ? 'github_timeout' : 'github_network',
        },
      );
    } finally {
      clearTimeout(timer);
    }

    let result = null;
    const text = await response.text();
    if (text) {
      try {
        result = JSON.parse(text);
      } catch {
        result = null;
      }
    }
    if (!response.ok) {
      const safeMessage = redactSecrets(result?.message || `HTTP ${response.status}`, secrets);
      throw new GitHubContentError(`GitHub request failed: ${safeMessage}`, {
        status: response.status === 429 ? 429 : 502,
        code: `github_${response.status}`,
        details: { githubStatus: response.status },
      });
    }
    return result;
  }

  async function readSnapshot() {
    const ref = await request(`/git/ref/heads/${encodeRefPath(branch)}`);
    const headSha = ref?.object?.sha;
    if (!/^[a-f0-9]{40}$/i.test(headSha || '')) {
      throw new GitHubContentError('GitHub returned an invalid branch head.', {
        code: 'invalid_github_response',
      });
    }

    const commit = await request(`/git/commits/${headSha}`);
    const treeSha = commit?.tree?.sha;
    if (!/^[a-f0-9]{40}$/i.test(treeSha || '')) {
      throw new GitHubContentError('GitHub returned an invalid commit tree.', {
        code: 'invalid_github_response',
      });
    }

    const tree = await request(`/git/trees/${treeSha}?recursive=1`);
    if (!Array.isArray(tree?.tree) || tree.truncated) {
      throw new GitHubContentError('GitHub returned an incomplete repository tree.', {
        code: 'invalid_github_response',
      });
    }
    const treeByPath = new Map(tree.tree.map((entry) => [entry.path, entry]));
    const datasets = {};
    const moduleSources = {};

    await Promise.all(
      Object.entries(DATA_DEFINITIONS).map(async ([key, definition]) => {
        const entry = treeByPath.get(definition.file);
        if (!entry || entry.type !== 'blob') {
          throw new GitHubContentError(`Remote data file is missing: ${definition.file}`, {
            code: 'invalid_remote_content',
          });
        }
        const blob = await request(`/git/blobs/${entry.sha}`);
        if (blob?.encoding !== 'base64' || typeof blob.content !== 'string') {
          throw new GitHubContentError(`Invalid blob response for ${definition.file}`, {
            code: 'invalid_github_response',
          });
        }
        const source = Buffer.from(blob.content.replace(/\s/g, ''), 'base64').toString('utf8');
        const parsed = parseDataModule(source, definition.exportName);
        const validation = validateContent(key, parsed);
        if (!validation.success) {
          throw new GitHubContentError(
            `Remote data file failed schema validation: ${definition.file}`,
            {
              status: 502,
              code: 'invalid_remote_content',
              details: {
                issues: validation.error.issues.map((issue) => ({
                  path: issue.path,
                  code: issue.code,
                  message: issue.message,
                })),
              },
            },
          );
        }
        datasets[key] = validation.data;
        moduleSources[key] = source;
      }),
    );

    return { headSha, treeSha, treeByPath, datasets, moduleSources };
  }

  async function createBlob(content, encoding) {
    const blob = await request('/git/blobs', {
      method: 'POST',
      body: { content, encoding },
    });
    if (!/^[a-f0-9]{40}$/i.test(blob?.sha || '')) {
      throw new GitHubContentError('GitHub returned an invalid blob SHA.', {
        code: 'invalid_github_response',
      });
    }
    return blob.sha;
  }

  async function getCurrentHead() {
    const ref = await request(`/git/ref/heads/${encodeRefPath(branch)}`);
    return ref?.object?.sha || null;
  }

  async function save({
    baseSha,
    updates,
    images = [],
    message = 'chore: update site content',
  }) {
    const snapshot = await readSnapshot();
    if (!baseSha || baseSha !== snapshot.headSha) {
      const desiredContentAlreadyPresent = Object.entries(updates).every(
        ([key, value]) => {
          const definition = DATA_DEFINITIONS[key];
          return (
            definition &&
            formatDataModule(definition.exportName, value) ===
              snapshot.moduleSources[key]
          );
        },
      );
      const desiredImagesAlreadyPresent = images.every((image) =>
        snapshot.treeByPath.has(image.relativePath),
      );
      if (desiredContentAlreadyPresent && desiredImagesAlreadyPresent) {
        return {
          status: 'unchanged',
          baseSha: snapshot.headSha,
          content: snapshot.datasets,
          files: [],
        };
      }
      throw new GitHubContentError(
        'Remote content changed. Reload the latest content before saving again.',
        {
          status: 409,
          code: 'content_conflict',
          details: { currentSha: snapshot.headSha },
        },
      );
    }

    const nextDatasets = { ...snapshot.datasets, ...updates };
    const treeEntries = [];
    const changedFiles = [];

    for (const [key, value] of Object.entries(updates)) {
      const definition = DATA_DEFINITIONS[key];
      const source = formatDataModule(definition.exportName, value);
      if (source !== snapshot.moduleSources[key]) {
        const sha = await createBlob(source, 'utf-8');
        treeEntries.push({
          path: definition.file,
          mode: '100644',
          type: 'blob',
          sha,
        });
        changedFiles.push(definition.file);
      }
    }

    for (const image of images) {
      if (!CONTENT_IMAGE_RE.test(image.relativePath)) {
        throw new GitHubContentError('Refusing to write an unmanaged image path.', {
          status: 422,
          code: 'invalid_image_path',
        });
      }
      if (snapshot.treeByPath.has(image.relativePath)) continue;
      const sha = await createBlob(encodeBase64(image.bytes), 'base64');
      treeEntries.push({
        path: image.relativePath,
        mode: '100644',
        type: 'blob',
        sha,
      });
      changedFiles.push(image.relativePath);
    }

    const oldSubmittedRefs = new Set();
    for (const key of Object.keys(updates)) {
      collectContentImageRefs(snapshot.datasets[key], oldSubmittedRefs);
    }
    const allNextRefs = collectContentImageRefs(nextDatasets);
    for (const path of oldSubmittedRefs) {
      if (
        !allNextRefs.has(path) &&
        CONTENT_IMAGE_RE.test(path) &&
        snapshot.treeByPath.has(path)
      ) {
        treeEntries.push({ path, mode: '100644', type: 'blob', sha: null });
        changedFiles.push(path);
      }
    }

    if (treeEntries.length === 0) {
      return {
        status: 'unchanged',
        baseSha: snapshot.headSha,
        content: nextDatasets,
        files: [],
      };
    }

    const tree = await request('/git/trees', {
      method: 'POST',
      body: { base_tree: snapshot.treeSha, tree: treeEntries },
    });
    if (!/^[a-f0-9]{40}$/i.test(tree?.sha || '')) {
      throw new GitHubContentError('GitHub returned an invalid tree SHA.', {
        code: 'invalid_github_response',
      });
    }
    const commit = await request('/git/commits', {
      method: 'POST',
      body: {
        message: String(message).slice(0, 240),
        tree: tree.sha,
        parents: [snapshot.headSha],
      },
    });
    if (!/^[a-f0-9]{40}$/i.test(commit?.sha || '')) {
      throw new GitHubContentError('GitHub returned an invalid commit SHA.', {
        code: 'invalid_github_response',
      });
    }

    try {
      await request(`/git/refs/heads/${encodeRefPath(branch)}`, {
        method: 'PATCH',
        body: { sha: commit.sha, force: false },
      });
    } catch (error) {
      if (error instanceof GitHubContentError) {
        const githubStatus = error.details?.githubStatus;
        if (isConflictStatus(githubStatus)) {
          const currentSha = await getCurrentHead().catch(() => null);
          throw new GitHubContentError(
            'Remote content changed while this save was in progress. Reload and retry.',
            {
              status: 409,
              code: 'content_conflict',
              details: { currentSha },
            },
          );
        }
      }
      throw error;
    }

    return {
      status: 'saved',
      baseSha: commit.sha,
      content: nextDatasets,
      files: [...new Set(changedFiles)],
      commitSha: commit.sha,
    };
  }

  return { readSnapshot, save };
}

export function contentDigest(value) {
  return crypto.createHash('sha256').update(serializePureJson(value)).digest('hex');
}
