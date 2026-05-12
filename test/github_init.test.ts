// SPDX-License-Identifier: BUSL-1.1
// Tests for 20.6.8 — non-interactive init for GitHub repos

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir, homedir } from 'os';

function makeTmpDir(suffix: string): string {
  const dir = join(tmpdir(), `postlane-gi-${suffix}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeGitConfig(repoDir: string, url: string): void {
  const gitDir = join(repoDir, '.git');
  mkdirSync(gitDir, { recursive: true });
  writeFileSync(
    join(gitDir, 'config'),
    `[core]\n\trepositoryformatversion = 0\n[remote "origin"]\n\turl = ${url}\n`,
  );
}

// ---------------------------------------------------------------------------
// fetchGitHubProjectConfig unit tests
// ---------------------------------------------------------------------------

describe('fetchGitHubProjectConfig', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns project info when the desktop app responds with 200', async () => {
    const { vi: _vi } = await import('vitest');
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ project_id: 'proj-uuid-1', project_name: 'Acme' }),
    } as Response);

    const { fetchGitHubProjectConfig } = await import('../src/utils/github_project_config.js');
    const result = await fetchGitHubProjectConfig('acme-org', 47312, 'test-session-token');
    expect(result).not.toBeNull();
    expect(result?.project_id).toBe('proj-uuid-1');
    expect(result?.project_name).toBe('Acme');
  });

  it('returns null when the desktop app responds with 404', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: 'not_found' }),
    } as Response);

    const { fetchGitHubProjectConfig } = await import('../src/utils/github_project_config.js');
    const result = await fetchGitHubProjectConfig('unknown-org', 47312, 'test-session-token');
    expect(result).toBeNull();
  });

  it('returns null when fetch throws (app not running)', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const { fetchGitHubProjectConfig } = await import('../src/utils/github_project_config.js');
    const result = await fetchGitHubProjectConfig('acme-org', 47312, 'test-session-token');
    expect(result).toBeNull();
  });

  it('sends Authorization Bearer header with the session token', async () => {
    let capturedHeaders: Record<string, string> = {};
    vi.spyOn(global, 'fetch').mockImplementationOnce(async (_url, init) => {
      capturedHeaders = Object.fromEntries(
        Object.entries((init?.headers ?? {}) as Record<string, string>),
      );
      return { ok: true, json: async () => ({ project_id: 'p', project_name: 'n' }) } as Response;
    });

    const { fetchGitHubProjectConfig } = await import('../src/utils/github_project_config.js');
    await fetchGitHubProjectConfig('acme-org', 47312, 'my-secret-token');
    expect(capturedHeaders['Authorization']).toBe('Bearer my-secret-token');
  });
});

// ---------------------------------------------------------------------------
// writeGitHubConfigFiles unit tests
// ---------------------------------------------------------------------------

describe('writeGitHubConfigFiles', () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = makeTmpDir('wghcf');
    mkdirSync(join(repoDir, '.git'), { recursive: true });
  });

  afterEach(() => { rmSync(repoDir, { recursive: true, force: true }); });

  it('writes project_id to config.json', async () => {
    const { writeGitHubConfigFiles } = await import('../src/utils/files.js');
    writeGitHubConfigFiles(repoDir, 'proj-uuid-1', 'Acme');
    const config = JSON.parse(readFileSync(join(repoDir, '.postlane', 'config.json'), 'utf8'));
    expect(config.project_id).toBe('proj-uuid-1');
  });

  it('writes a valid config.json with required fields', async () => {
    const { writeGitHubConfigFiles } = await import('../src/utils/files.js');
    writeGitHubConfigFiles(repoDir, 'proj-uuid-1', 'Acme');
    const config = JSON.parse(readFileSync(join(repoDir, '.postlane', 'config.json'), 'utf8'));
    expect(config.version).toBe(1);
    expect(Array.isArray(config.platforms)).toBe(true);
    expect(config.llm?.provider).toBeTruthy();
    expect(config.llm?.model).toBeTruthy();
  });

  it('creates skill files in .claude/commands/', async () => {
    const { writeGitHubConfigFiles } = await import('../src/utils/files.js');
    writeGitHubConfigFiles(repoDir, 'proj-uuid-1', 'Acme');
    expect(existsSync(join(repoDir, '.claude', 'commands', 'draft-post.md'))).toBe(true);
  });

  it('adds config.local.json to .postlane/.gitignore', async () => {
    const { writeGitHubConfigFiles } = await import('../src/utils/files.js');
    writeGitHubConfigFiles(repoDir, 'proj-uuid-1', 'Acme');
    const gitignore = readFileSync(join(repoDir, '.postlane', '.gitignore'), 'utf8');
    expect(gitignore).toContain('config.local.json');
  });
});

// ---------------------------------------------------------------------------
// initCommand — GitHub non-interactive flow
// ---------------------------------------------------------------------------

const MINIMAL_ANSWERS = {
  baseUrl: 'https://example.com',
  platforms: ['x', 'bluesky'],
  llmProvider: 'anthropic',
  llmModel: 'claude-sonnet-4-6',
  schedulerProvider: 'zernio',
  schedulerApiKey: '',
  repoType: 'open-source-library',
  style: 'Direct.',
  utmCampaign: '',
  author: 'Test',
};

describe('initCommand — GitHub non-interactive (20.6.8)', () => {
  it('skips askSetupQuestions and writes project_id for GitHub repos when app is running', async () => {
    const { vi: _vi } = await import('vitest');
    vi.resetModules();

    let setupQuestionsCallCount = 0;
    vi.doMock('../src/utils/questions.js', () => ({
      askSetupQuestions: async () => { setupQuestionsCallCount++; return MINIMAL_ANSWERS; },
    }));
    vi.doMock('../src/commands/register.js', () => ({
      registerCommand: async () => {},
    }));
    vi.doMock('../src/utils/github_project_config.js', () => ({
      fetchGitHubProjectConfig: async () => ({ project_id: 'proj-uuid-1', project_name: 'Acme' }),
      readAppSessionInfo: () => ({ port: 47312, token: 'test-token' }),
    }));

    const repoDir = makeTmpDir('init-gh-noninteractive');
    mkdirSync(join(repoDir, '.git'), { recursive: true });
    writeGitConfig(repoDir, 'https://github.com/acme-org/my-repo.git');

    const origCwd = process.cwd();
    process.chdir(repoDir);
    try {
      const { initCommand } = await import('../src/commands/init.js');
      await initCommand({});
      expect(setupQuestionsCallCount).toBe(0);
      const config = JSON.parse(readFileSync(join(repoDir, '.postlane', 'config.json'), 'utf8'));
      expect(config.project_id).toBe('proj-uuid-1');
    } finally {
      process.chdir(origCwd);
      rmSync(repoDir, { recursive: true, force: true });
      vi.doUnmock('../src/utils/questions.js');
      vi.doUnmock('../src/commands/register.js');
      vi.doUnmock('../src/utils/github_project_config.js');
      vi.resetModules();
    }
  });

  it('falls back to interactive flow when GitHub project config fetch returns null', async () => {
    const { vi: _vi } = await import('vitest');
    vi.resetModules();

    let setupQuestionsCallCount = 0;
    vi.doMock('../src/utils/questions.js', () => ({
      askSetupQuestions: async () => { setupQuestionsCallCount++; return MINIMAL_ANSWERS; },
    }));
    vi.doMock('../src/commands/register.js', () => ({
      registerCommand: async () => {},
    }));
    vi.doMock('../src/utils/github_project_config.js', () => ({
      fetchGitHubProjectConfig: async () => null,
      readAppSessionInfo: () => ({ port: 47312, token: 'test-token' }),
    }));

    const repoDir = makeTmpDir('init-gh-fallback');
    mkdirSync(join(repoDir, '.git'), { recursive: true });
    writeGitConfig(repoDir, 'https://github.com/acme-org/my-repo.git');

    const origCwd = process.cwd();
    process.chdir(repoDir);
    try {
      const { initCommand } = await import('../src/commands/init.js');
      await initCommand({});
      expect(setupQuestionsCallCount).toBe(1);
    } finally {
      process.chdir(origCwd);
      rmSync(repoDir, { recursive: true, force: true });
      vi.doUnmock('../src/utils/questions.js');
      vi.doUnmock('../src/commands/register.js');
      vi.doUnmock('../src/utils/github_project_config.js');
      vi.resetModules();
    }
  });

  it('falls back to interactive flow when app session info is unavailable', async () => {
    const { vi: _vi } = await import('vitest');
    vi.resetModules();

    let setupQuestionsCallCount = 0;
    vi.doMock('../src/utils/questions.js', () => ({
      askSetupQuestions: async () => { setupQuestionsCallCount++; return MINIMAL_ANSWERS; },
    }));
    vi.doMock('../src/commands/register.js', () => ({
      registerCommand: async () => {},
    }));
    vi.doMock('../src/utils/github_project_config.js', () => ({
      fetchGitHubProjectConfig: async () => null,
      readAppSessionInfo: () => null,
    }));

    const repoDir = makeTmpDir('init-gh-no-session');
    mkdirSync(join(repoDir, '.git'), { recursive: true });
    writeGitConfig(repoDir, 'https://github.com/acme-org/my-repo.git');

    const origCwd = process.cwd();
    process.chdir(repoDir);
    try {
      const { initCommand } = await import('../src/commands/init.js');
      await initCommand({});
      expect(setupQuestionsCallCount).toBe(1);
    } finally {
      process.chdir(origCwd);
      rmSync(repoDir, { recursive: true, force: true });
      vi.doUnmock('../src/utils/questions.js');
      vi.doUnmock('../src/commands/register.js');
      vi.doUnmock('../src/utils/github_project_config.js');
      vi.resetModules();
    }
  });
});
