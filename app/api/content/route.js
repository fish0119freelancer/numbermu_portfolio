import { NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import { execFile } from 'child_process';

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

const isValidKind = (value, kind) => {
  if (kind === 'array') return Array.isArray(value);
  if (kind === 'object') return value && typeof value === 'object' && !Array.isArray(value);
  return false;
};

const formatModule = (exportName, value) =>
  `export const ${exportName} = ${JSON.stringify(value, null, 2)};\n`;

const runGit = async (args, logs) => {
  try {
    const result = await execFileAsync('git', args, { cwd: repoRoot });
    logs?.push({
      command: `git ${args.join(' ')}`,
      stdout: result.stdout?.trim() || '',
      stderr: result.stderr?.trim() || '',
      success: true,
    });
    return result;
  } catch (error) {
    const stderr = error?.stderr?.trim() || error.message;
    logs?.push({
      command: `git ${args.join(' ')}`,
      stdout: error?.stdout?.trim() || '',
      stderr,
      success: false,
    });
    throw new Error(`git ${args.join(' ')} failed: ${stderr}`);
  }
};

const configureGitIdentity = async (logs) => {
  const name = process.env.GIT_COMMIT_USER || 'Render Content Bot';
  const email = process.env.GIT_COMMIT_EMAIL || 'render-bot@example.com';

  await runGit(['config', 'user.name', name], logs);
  await runGit(['config', 'user.email', email], logs);
};

const configureGitRemote = async (logs) => {
  const token = process.env.GIT_PUSH_TOKEN;
  const fallbackRemote = process.env.GIT_REMOTE_URL;

  if (fallbackRemote) {
    try {
      await runGit(['remote', 'add', defaultRemote, fallbackRemote], logs);
    } catch (error) {
      if (!error.message.includes('already exists')) {
        throw error;
      }
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

  if (!currentUrl.startsWith('https://')) return;
  if (!token) return;

  const username =
    process.env.GIT_PUSH_USERNAME ||
    process.env.GIT_COMMIT_USER ||
    process.env.GIT_USER ||
    'x-access-token';

  let authenticatedUrl;
  try {
    const parsed = new URL(currentUrl);

    if (parsed.username === username && parsed.password === token) {
      return;
    }

    parsed.username = username;
    parsed.password = token;
    authenticatedUrl = parsed.toString();
  } catch {
    const encodedUser = encodeURIComponent(username);
    const encodedToken = encodeURIComponent(token);
    const tokenPrefix = `https://${encodedUser}:${encodedToken}@`;
    if (currentUrl.startsWith(tokenPrefix)) return;
    authenticatedUrl = currentUrl.replace('https://', tokenPrefix);
  }

  await runGit(['remote', 'set-url', defaultRemote, authenticatedUrl], logs);
};

const writeDataModule = async ({ exportName, file }, value) => {
  const filePath = path.join(repoRoot, file);
  const contents = formatModule(exportName, value);
  await writeFile(filePath, contents, 'utf8');
  return file;
};

export async function POST(request) {
  const token = request.headers.get('x-admin-token');
  const expectedToken = process.env.ADMIN_API_TOKEN;

  if (!expectedToken) {
    return NextResponse.json(
      { error: 'Server misconfiguration: ADMIN_API_TOKEN not set.' },
      { status: 500 },
    );
  }

  if (!token || token !== expectedToken) {
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
  const gitLogs = [];

  if (targetKeys.length === 0) {
    return NextResponse.json({ error: 'No recognized payload keys provided' }, { status: 400 });
  }

  try {
    const touchedFiles = [];

    for (const key of targetKeys) {
      const definition = DATA_DEFINITIONS[key];
      const value = payload[key];

      if (!isValidKind(value, definition.kind)) {
        return NextResponse.json(
          { error: `Invalid payload for ${key}. Expected ${definition.kind}.` },
          { status: 400 },
        );
      }

      const file = await writeDataModule(definition, value);
      touchedFiles.push(file);
    }

    for (const file of touchedFiles) {
      await runGit(['add', file], gitLogs);
    }

    await configureGitIdentity(gitLogs);

    const commitMessage =
      typeof payload.commitMessage === 'string' && payload.commitMessage.trim()
        ? payload.commitMessage.trim()
        : defaultCommitMessage;

    try {
      await runGit(['commit', '-m', commitMessage], gitLogs);
    } catch (error) {
      if (error.message.includes('nothing to commit')) {
        return NextResponse.json(
          { message: 'No changes to commit', files: touchedFiles, gitLogs },
          { status: 200 },
        );
      }
      throw error;
    }

    await configureGitRemote(gitLogs);
    await runGit(['push', defaultRemote, defaultBranch], gitLogs);

    return NextResponse.json(
      { message: 'Content updated and pushed successfully', files: touchedFiles, gitLogs },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json({ error: error.message, gitLogs }, { status: 500 });
  }
}
