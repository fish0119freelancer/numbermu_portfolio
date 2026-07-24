import { NextResponse } from 'next/server';
import { writeFile, mkdir, readFile, unlink } from 'fs/promises';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { promisify } from 'util';
import { execFile } from 'child_process';

import {
  serializePureJson,
  validateContent,
  validateImageBudget,
  IMAGE_LIMITS,
} from '../../../lib/content-contract.mjs';
import { extractImagesFromPayload } from '../../../lib/image-extractor.mjs';

const execFileAsync = promisify(execFile);

const DATA_DEFINITIONS = {
  pixilartItems: { exportName: 'pixilartItems', file: 'data/pixilart.js', kind: 'array' },
  artItems: { exportName: 'artItems', file: 'data/art.js', kind: 'array' },
  typeItems: { exportName: 'typeItems', file: 'data/type.js', kind: 'array' },
  workItems: { exportName: 'workItems', file: 'data/work.js', kind: 'array' },
  profileData: { exportName: 'profile', file: 'data/about.js', kind: 'object' },
};

const repoRoot = process.cwd();
const defaultCommitMessage = 'chore: update site content';
const defaultRemote = process.env.CONTENT_UPDATE_REMOTE || 'origin';
const defaultBranch = process.env.CONTENT_UPDATE_BRANCH || 'main';

// ---------------------------------------------------------------------------
// #13 — Rate limiting + timing-safe token comparison. In-memory limiter is
// sufficient for a single Render instance; a multi-instance deployment would
// need a shared store (Redis/Upstash).
// ---------------------------------------------------------------------------
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const rateLimitStore = new Map();

const digestToken = (value) =>
  crypto.createHash('sha256').update(value || '', 'utf8').digest();

const safeTokenEqual = (provided, expected) => {
  // Hash both to a fixed length first, so differing lengths cannot leak via an
  // early return inside timingSafeEqual.
  const providedDigest = digestToken(provided);
  const expectedDigest = digestToken(expected);
  return crypto.timingSafeEqual(providedDigest, expectedDigest);
};

const getClientKey = (request) => {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  return forwarded?.split(',')[0]?.trim() || realIp?.trim() || 'unknown-client';
};

const checkRateLimit = (request) => {
  const now = Date.now();
  const key = getClientKey(request);
  const current = rateLimitStore.get(key);

  if (!current || now - current.startedAt >= RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(key, { startedAt: now, count: 1 });
    return { allowed: true, retryAfter: 0 };
  }

  current.count += 1;

  if (current.count > RATE_LIMIT_MAX_REQUESTS) {
    return {
      allowed: false,
      retryAfter: Math.ceil((RATE_LIMIT_WINDOW_MS - (now - current.startedAt)) / 1000),
    };
  }

  return { allowed: true, retryAfter: 0 };
};

const pruneRateLimitStore = () => {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.startedAt < cutoff) {
      rateLimitStore.delete(key);
    }
  }
  if (rateLimitStore.size > 10_000) {
    rateLimitStore.clear();
  }
};

// ---------------------------------------------------------------------------
// Secret redaction. Never let GIT_PUSH_TOKEN (or the absolute repo path) reach
// the git logs / error responses that we hand back to the browser.
// ---------------------------------------------------------------------------
const collectSecrets = () => {
  const secrets = [];
  if (process.env.GIT_PUSH_TOKEN) secrets.push(process.env.GIT_PUSH_TOKEN);
  if (process.env.ADMIN_API_TOKEN) secrets.push(process.env.ADMIN_API_TOKEN);
  return secrets.filter(Boolean);
};

const redact = (input) => {
  if (input == null) return input;
  let text = String(input);
  for (const secret of collectSecrets()) {
    if (secret) text = text.split(secret).join('***');
  }
  // Strip inline credentials from any URL: https://user:token@host -> https://***@host
  text = text.replace(/(https?:\/\/)[^/@\s]+@/g, '$1***@');
  // Do not leak the absolute on-disk repo path.
  text = text.split(repoRoot).join('<repo>');
  return text;
};

// Only ever hand the browser a safe summary of git activity: the (already
// redacted) command label and its exit code — never raw stdout/stderr, which
// can carry remote URLs or other sensitive strings.
const toSafeLogs = (logs) =>
  logs.map(({ command, code, success }) => ({ command, code, success }));

const formatModule = (exportName, value) => {
  const serialized = serializePureJson(value);
  return `export const ${exportName} = ${serialized};\n`;
};

// runGit now preserves the full result (stdout/stderr/code) instead of collapsing
// everything into an error message string. Git writes state like
// "nothing to commit" to STDOUT, so callers must inspect stdout — never the
// thrown message — to make control-flow decisions.
const runGit = async (args, logs, { label } = {}) => {
  const command = `git ${(label ?? args.join(' '))}`;
  try {
    const result = await execFileAsync('git', args, { cwd: repoRoot });
    logs?.push({
      command: redact(command),
      stdout: redact(result.stdout?.trim() || ''),
      stderr: redact(result.stderr?.trim() || ''),
      code: 0,
      success: true,
    });
    return { stdout: result.stdout || '', stderr: result.stderr || '', code: 0 };
  } catch (error) {
    const stdout = error?.stdout || '';
    const stderr = error?.stderr || '';
    const code = typeof error?.code === 'number' ? error.code : 1;
    logs?.push({
      command: redact(command),
      stdout: redact(stdout.trim()),
      stderr: redact(stderr.trim()),
      code,
      success: false,
    });
    const detail = stderr.trim() || stdout.trim() || error.message;
    const gitError = new Error(`git ${label ?? args.join(' ')} failed: ${redact(detail)}`);
    gitError.stdout = stdout;
    gitError.stderr = stderr;
    gitError.code = code;
    throw gitError;
  }
};

const configureGitIdentity = async (logs) => {
  const name = process.env.GIT_COMMIT_USER || 'Render Content Bot';
  const email = process.env.GIT_COMMIT_EMAIL || 'render-bot@example.com';

  await runGit(['config', 'user.name', name], logs);
  await runGit(['config', 'user.email', email], logs);
};

// Build a one-shot authenticated push URL. Critically this is used ONLY as an
// in-memory argument to `git push` — we never `git remote set-url` it, so the
// token never persists in .git/config, and runGit's redaction keeps it out of
// the logs we return to the client.
const resolvePushTarget = async (logs) => {
  const token = process.env.GIT_PUSH_TOKEN;
  const fallbackRemote = process.env.GIT_REMOTE_URL;

  if (fallbackRemote) {
    // Reject a credentialed GIT_REMOTE_URL: `git remote add` would persist it
    // into .git/config in cleartext. Only a bare (no-credential) URL is allowed.
    if (/\/\/[^/@\s]+@/.test(fallbackRemote)) {
      throw new Error('GIT_REMOTE_URL must not contain inline credentials.');
    }
    try {
      await runGit(['remote', 'add', defaultRemote, fallbackRemote], logs);
    } catch (error) {
      if (!error.message.includes('already exists')) throw error;
    }
  }

  let currentUrl;
  try {
    const { stdout } = await runGit(['remote', 'get-url', defaultRemote], logs);
    currentUrl = stdout.trim();
  } catch (error) {
    throw new Error(
      `Missing git remote '${defaultRemote}'. Provide GIT_REMOTE_URL so the service can add one automatically.`,
    );
  }

  if (!token || !currentUrl.startsWith('https://')) {
    return { target: defaultRemote, label: defaultRemote };
  }

  const username =
    process.env.GIT_PUSH_USERNAME ||
    process.env.GIT_COMMIT_USER ||
    process.env.GIT_USER ||
    'x-access-token';

  try {
    const parsed = new URL(currentUrl);
    // Strip any pre-existing credentials before injecting our own.
    parsed.username = encodeURIComponent(username);
    parsed.password = encodeURIComponent(token);
    return { target: parsed.toString(), label: defaultRemote };
  } catch {
    const tokenPrefix = `https://${encodeURIComponent(username)}:${encodeURIComponent(token)}@`;
    return { target: currentUrl.replace('https://', tokenPrefix), label: defaultRemote };
  }
};

const writeDataModule = async ({ exportName, file }, value) => {
  // Pure-JSON guard again at write time (defense in depth).
  serializePureJson(value);

  const filePath = path.join(repoRoot, file);
  // Defense in depth: the caller only ever passes whitelisted definitions, but
  // assert the resolved path can never escape the repo's data/ directory.
  const resolved = path.resolve(filePath);
  const dataDir = path.resolve(repoRoot, 'data');
  if (resolved !== dataDir && !resolved.startsWith(dataDir + path.sep)) {
    throw new Error('Refusing to write outside data directory');
  }
  const contents = formatModule(exportName, value);
  await writeFile(resolved, contents, 'utf8');
  return file;
};

// ---------------------------------------------------------------------------
// Repo-level serialization. Every request that touches git runs through a
// single in-process queue so concurrent panel saves cannot interleave their
// add/commit/push and steal each other's staged changes. (Single Next
// instance only; a multi-process deployment would need a file/OS lock.)
// ---------------------------------------------------------------------------
let gitQueue = Promise.resolve();
const withGitLock = (fn) => {
  const run = gitQueue.then(fn, fn);
  gitQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
};

export async function POST(request) {
  pruneRateLimitStore();

  const rateLimit = checkRateLimit(request);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } },
    );
  }

  const token = request.headers.get('x-admin-token');
  const expectedToken = process.env.ADMIN_API_TOKEN;

  if (!expectedToken) {
    return NextResponse.json(
      { error: 'Server misconfiguration: ADMIN_API_TOKEN not set.' },
      { status: 500 },
    );
  }

  if (!token || !safeTokenEqual(token, expectedToken)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object') {
    return NextResponse.json({ error: 'Request body must be an object' }, { status: 400 });
  }

  const targetKeys = Object.keys(DATA_DEFINITIONS).filter(
    (key) => payload[key] !== undefined,
  );

  if (targetKeys.length === 0) {
    return NextResponse.json({ error: 'No recognized payload keys provided' }, { status: 400 });
  }

  // Validate schema + pure-JSON + image budget for every key BEFORE taking the
  // git lock or writing anything. Any failure short-circuits with a 4xx and
  // leaves the repo untouched.
  const validated = {};
  for (const key of targetKeys) {
    const result = validateContent(key, payload[key]);
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

    try {
      validateImageBudget(key, result.data);
      serializePureJson(result.data);
    } catch (error) {
      return NextResponse.json(
        { error: `Invalid content budget for ${key}`, detail: error.message },
        { status: 422 },
      );
    }

    validated[key] = result.data;
  }

  const commitMessage =
    typeof payload.commitMessage === 'string' && payload.commitMessage.trim()
      ? payload.commitMessage.trim()
      : defaultCommitMessage;

  try {
    return await withGitLock(async () => {
      const gitLogs = [];
      const touchedFiles = [];
      const createdImageFiles = [];
      const backupDataFiles = new Map();

      const extractionOptions = {
        publicDir: path.join(repoRoot, 'public'),
        imagePrefix: '/images/content/',
        maxImageBytes: IMAGE_LIMITS.maxSingleBytes,
        maxTotalBytes: IMAGE_LIMITS.maxPayloadBytes,
      };

      try {
        for (const key of targetKeys) {
          const definition = DATA_DEFINITIONS[key];
          const dataFilePath = path.join(repoRoot, definition.file);

          try {
            const originalContent = await readFile(dataFilePath);
            backupDataFiles.set(dataFilePath, originalContent);
          } catch {
            backupDataFiles.set(dataFilePath, null);
          }

          const { payload: transformedPayload, imageFiles } = extractImagesFromPayload(
            validated[key],
            extractionOptions,
          );

          for (const img of imageFiles) {
            if (img.created) {
              const dir = path.dirname(img.absolutePath);
              await mkdir(dir, { recursive: true });

              const tempPath = `${img.absolutePath}.tmp.${Date.now()}_${Math.random().toString(36).substring(2)}`;
              await writeFile(tempPath, img.bytes);
              await fs.promises.rename(tempPath, img.absolutePath);

              createdImageFiles.push(img);
              if (!touchedFiles.includes(img.relativePath)) {
                touchedFiles.push(img.relativePath);
              }
            }
          }

          const file = await writeDataModule(definition, transformedPayload);
          if (!touchedFiles.includes(file)) {
            touchedFiles.push(file);
          }
        }

        await configureGitIdentity(gitLogs);

        // Stage only the files this request touched.
        await runGit(['add', '--', ...touchedFiles], gitLogs);

        // Decide "nothing to commit" from git's actual porcelain output for OUR
        // files — never from a thrown error message.
        const status = await runGit(['status', '--porcelain', '--', ...touchedFiles], gitLogs);
        if (!status.stdout.trim()) {
          return NextResponse.json(
            {
              message: 'No changes to commit',
              status: 'unchanged',
              files: touchedFiles,
              written: true,
              committed: false,
              pushed: false,
              gitLogs: toSafeLogs(gitLogs),
            },
            { status: 200 },
          );
        }

        // Commit ONLY our pathspec, so a stray file staged by another actor can
        // never be swept into this commit.
        await runGit(['commit', '-m', commitMessage, '--', ...touchedFiles], gitLogs);
      } catch (transactionErr) {
        for (const [filePath, content] of backupDataFiles.entries()) {
          if (content !== null) {
            await writeFile(filePath, content).catch(() => {});
          }
        }
        for (const img of createdImageFiles) {
          await unlink(img.absolutePath).catch(() => {});
        }
        if (touchedFiles.length > 0) {
          await runGit(['reset', 'HEAD', '--', ...touchedFiles], []).catch(() => {});
        }
        throw transactionErr;
      }

      // Everything past this point is "publish". The commit already exists
      // locally, so ANY failure here (including resolving the remote) must be
      // reported as committed_not_pushed — never as a generic save failure.
      let pushed = false;
      let pushWarning;
      try {
        const { target, label } = await resolvePushTarget(gitLogs);
        const pushArgs = ['push', target, `HEAD:${defaultBranch}`];
        const pushLabel = `push ${label} HEAD:${defaultBranch}`;

        try {
          await runGit(pushArgs, gitLogs, { label: pushLabel });
          pushed = true;
        } catch (error) {
          const combined = `${error.stderr || ''}${error.stdout || ''}`;
          if (combined.includes('fetch first') || combined.includes('stale info')) {
            // Retry must fetch through the SAME authenticated target (a bare
            // remote name would fail on a private HTTPS repo), then rebase our
            // content commit on top of whatever landed concurrently (e.g. a code
            // push from the dev machine). merge --ff-only would reject diverged
            // history; rebase replays our commit cleanly.
            await runGit(['fetch', target, defaultBranch], gitLogs, {
              label: `fetch ${label} ${defaultBranch}`,
            });
            await runGit(['rebase', 'FETCH_HEAD'], gitLogs);
            await runGit(pushArgs, gitLogs, { label: pushLabel });
            pushed = true;
          } else {
            throw error;
          }
        }
      } catch (error) {
        pushWarning = redact(error.message);
        pushed = false;
      }

      const deployHook = process.env.RENDER_DEPLOY_HOOK_URL || process.env.DEPLOY_HOOK_URL;
      let hookResponse;
      if (pushed && deployHook) {
        try {
          const response = await fetch(deployHook, { method: 'POST' });
          hookResponse = { status: response.status, ok: response.ok };
        } catch (hookError) {
          hookResponse = { status: 'error', error: redact(hookError.message) };
        }
      }

      if (!pushed) {
        // The commit exists locally; be explicit that it is NOT yet published
        // rather than reporting a generic save failure.
        return NextResponse.json(
          {
            message:
              '已在伺服器建立提交，但推送到遠端失敗，變更尚未發布。請稍後重試或通知管理者。',
            status: 'committed_not_pushed',
            files: touchedFiles,
            written: true,
            committed: true,
            pushed: false,
            pushWarning,
            gitLogs: toSafeLogs(gitLogs),
          },
          { status: 502 },
        );
      }

      return NextResponse.json(
        {
          message: 'Content updated and pushed successfully',
          status: 'pushed',
          files: touchedFiles,
          written: true,
          committed: true,
          pushed: true,
          gitLogs: toSafeLogs(gitLogs),
          deployHook: hookResponse,
        },
        { status: 200 },
      );
    });
  } catch (error) {
    return NextResponse.json({ error: redact(error.message) }, { status: 500 });
  }
}
