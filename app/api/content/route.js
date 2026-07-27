import crypto from 'crypto';
import { NextResponse } from 'next/server.js';

import {
  IMAGE_LIMITS,
  serializePureJson,
  validateContent,
  validateImageBudget,
} from '../../../lib/content-contract.mjs';
import { extractImagesFromPayload } from '../../../lib/image-extractor.mjs';
import {
  DATA_DEFINITIONS,
  GitHubContentError,
  createGitHubContentService,
  redactSecrets,
  resolveGitHubConfig,
} from '../../../lib/github-content.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_COMMIT_MESSAGE = 'chore: update site content';
const MAX_REQUEST_BODY_BYTES = 18 * 1024 * 1024;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const rateLimitStore = new Map();

const digestToken = (value) =>
  crypto.createHash('sha256').update(value || '', 'utf8').digest();

const safeTokenEqual = (provided, expected) =>
  crypto.timingSafeEqual(digestToken(provided), digestToken(expected));

function authenticate(request) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: 'Server misconfiguration: ADMIN_API_TOKEN not set.' },
      { status: 500 },
    );
  }
  const provided = request.headers.get('x-admin-token');
  if (!provided || !safeTokenEqual(provided, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

function getClientKey(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  return (
    forwarded?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    'unknown-client'
  );
}

function checkRateLimit(request) {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  for (const [storedKey, entry] of rateLimitStore.entries()) {
    if (entry.startedAt < cutoff) rateLimitStore.delete(storedKey);
  }
  if (rateLimitStore.size > 10_000) rateLimitStore.clear();

  const key = getClientKey(request);
  const current = rateLimitStore.get(key);
  if (!current || now - current.startedAt >= RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(key, { startedAt: now, count: 1 });
    return null;
  }
  current.count += 1;
  if (current.count <= RATE_LIMIT_MAX_REQUESTS) return null;
  const retryAfter = Math.max(
    1,
    Math.ceil((RATE_LIMIT_WINDOW_MS - (now - current.startedAt)) / 1000),
  );
  return NextResponse.json(
    { error: 'Too many requests. Try again later.' },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } },
  );
}

async function readJsonBody(request) {
  if (!request.body || typeof request.body.getReader !== 'function') {
    return request.json();
  }

  const reader = request.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      totalBytes += chunk.length;
      if (totalBytes > MAX_REQUEST_BODY_BYTES) {
        await reader.cancel();
        const error = new Error('Request body is too large.');
        error.code = 'payload_too_large';
        throw error;
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function makeService() {
  return createGitHubContentService({
    config: resolveGitHubConfig(),
    fetchImpl: fetch,
    timeoutMs: 15_000,
  });
}

function safeErrorResponse(error) {
  const secrets = [
    process.env.GITHUB_TOKEN,
    process.env.GIT_PUSH_TOKEN,
    process.env.ADMIN_API_TOKEN,
    process.env.RENDER_DEPLOY_HOOK_URL,
    process.env.DEPLOY_HOOK_URL,
  ];
  if (error instanceof GitHubContentError) {
    const isConflict = error.code === 'content_conflict';
    return NextResponse.json(
      {
        status: isConflict ? 'conflict' : 'error',
        error: error.code,
        message: redactSecrets(error.message, secrets),
        ...(error.details || {}),
      },
      { status: error.status },
    );
  }
  return NextResponse.json(
    {
      error: 'content_save_failed',
      message: redactSecrets(error?.message || 'Unexpected save failure.', secrets),
    },
    { status: 500 },
  );
}

async function triggerDeployHook() {
  const hookUrl =
    process.env.RENDER_DEPLOY_HOOK_URL || process.env.DEPLOY_HOOK_URL;
  if (!hookUrl) return { status: 'not_configured' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(hookUrl, {
      method: 'POST',
      signal: controller.signal,
    });
    return response.ok
      ? { status: 'deploy_triggered', httpStatus: response.status }
      : { status: 'deploy_hook_failed', httpStatus: response.status };
  } catch {
    return { status: 'deploy_hook_failed' };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request) {
  const authError = authenticate(request);
  if (authError) return authError;
  const limited = checkRateLimit(request);
  if (limited) return limited;

  try {
    const snapshot = await makeService().readSnapshot();
    return NextResponse.json(
      {
        status: 'loaded',
        headSha: snapshot.headSha,
        data: snapshot.datasets,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return safeErrorResponse(error);
  }
}

export async function POST(request) {
  const authError = authenticate(request);
  if (authError) return authError;
  const limited = checkRateLimit(request);
  if (limited) return limited;

  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BODY_BYTES) {
    return NextResponse.json(
      {
        error: 'payload_too_large',
        message: 'Request body is too large. Images must stay within the documented limits.',
      },
      { status: 413 },
    );
  }

  let payload;
  try {
    payload = await readJsonBody(request);
  } catch (error) {
    if (error?.code === 'payload_too_large') {
      return NextResponse.json(
        {
          error: 'payload_too_large',
          message: 'Request body is too large. Images must stay within the documented limits.',
        },
        { status: 413 },
      );
    }
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json(
      { error: 'Request body must be an object' },
      { status: 400 },
    );
  }
  if (typeof payload.baseSha !== 'string' || !/^[a-f0-9]{40}$/i.test(payload.baseSha)) {
    return NextResponse.json(
      {
        error: 'base_sha_required',
        message: 'Load the latest remote content before saving.',
      },
      { status: 428 },
    );
  }

  const panels =
    payload.panels === undefined
      ? payload
      : payload.panels &&
          typeof payload.panels === 'object' &&
          !Array.isArray(payload.panels)
        ? payload.panels
        : null;
  if (!panels) {
    return NextResponse.json(
      { error: 'panels must be an object' },
      { status: 400 },
    );
  }
  const targetKeys = Object.keys(DATA_DEFINITIONS).filter(
    (key) => panels[key] !== undefined,
  );
  if (targetKeys.length === 0) {
    return NextResponse.json(
      { error: 'No recognized payload keys provided' },
      { status: 400 },
    );
  }

  const updates = {};
  const images = [];
  try {
    for (const key of targetKeys) {
      const result = validateContent(key, panels[key]);
      if (!result.success) {
        return NextResponse.json(
          {
            error: `Invalid payload for ${key}`,
            issues: result.error.issues.map((issue) => ({
              path: issue.path,
              code: issue.code,
              message: issue.message,
            })),
          },
          { status: 422 },
        );
      }
      validateImageBudget(key, result.data);
      serializePureJson(result.data);
      const extracted = extractImagesFromPayload(result.data, {
        imagePrefix: '/images/content/',
        maxImageBytes: IMAGE_LIMITS.maxSingleBytes,
        maxTotalBytes: IMAGE_LIMITS.maxPayloadBytes,
        inMemory: true,
      });
      updates[key] = extracted.payload;
      images.push(...extracted.imageFiles);
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: 'invalid_content',
        message: error.message,
      },
      { status: 422 },
    );
  }

  const uniqueImages = [
    ...new Map(images.map((image) => [image.relativePath, image])).values(),
  ];
  const commitMessage =
    typeof payload.commitMessage === 'string' && payload.commitMessage.trim()
      ? payload.commitMessage.trim()
      : DEFAULT_COMMIT_MESSAGE;

  try {
    const result = await makeService().save({
      baseSha: payload.baseSha,
      updates,
      images: uniqueImages,
      message: commitMessage,
    });
    const deploy =
      result.status === 'saved'
        ? await triggerDeployHook()
        : { status: 'not_needed' };
    return NextResponse.json(
      {
        status: result.status,
        headSha: result.baseSha,
        data: result.content,
        files: result.files,
        ...(result.commitSha ? { commitSha: result.commitSha } : {}),
        message:
          result.status === 'saved'
            ? 'Content saved to GitHub. Site deployment may still be in progress.'
            : 'Content already matches GitHub; no commit was needed.',
        deploy,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return safeErrorResponse(error);
  }
}
