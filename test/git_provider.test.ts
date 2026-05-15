// SPDX-License-Identifier: BUSL-1.1
// Tests for 20.6.7 — detectGitProvider + initCommand provider-routing

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

function makeTmpDir(suffix: string): string {
  const dir = join(tmpdir(), `postlane-gp-${suffix}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeGitConfig(repoDir: string, url: string): void {
  const gitDir = join(repoDir, '.git');
  mkdirSync(gitDir, { recursive: true });
  writeFileSync(
    join(gitDir, 'config'),
    `[core]\n\trepositoryformatversion = 0\n[remote "origin"]\n\turl = ${url}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`,
  );
}

// ---------------------------------------------------------------------------
// detectGitProvider unit tests
// ---------------------------------------------------------------------------

describe('detectGitProvider', () => {
  let dir: string;

  beforeEach(() => { dir = makeTmpDir('dp'); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('returns github for an HTTPS github.com remote', async () => {
    writeGitConfig(dir, 'https://github.com/acme/my-repo.git');
    const { detectGitProvider } = await import('../src/git/provider.js');
    expect(detectGitProvider(dir)).toBe('github');
  });

  it('returns github for an SSH github.com remote', async () => {
    writeGitConfig(dir, 'git@github.com:acme/my-repo.git');
    const { detectGitProvider } = await import('../src/git/provider.js');
    expect(detectGitProvider(dir)).toBe('github');
  });

  it('returns gitlab for an HTTPS gitlab.com remote', async () => {
    writeGitConfig(dir, 'https://gitlab.com/acme/my-repo.git');
    const { detectGitProvider } = await import('../src/git/provider.js');
    expect(detectGitProvider(dir)).toBe('gitlab');
  });

  it('returns gitlab for an SSH gitlab.com remote', async () => {
    writeGitConfig(dir, 'git@gitlab.com:acme/my-repo.git');
    const { detectGitProvider } = await import('../src/git/provider.js');
    expect(detectGitProvider(dir)).toBe('gitlab');
  });

  it('returns other for a self-hosted remote', async () => {
    writeGitConfig(dir, 'https://git.company.internal/acme/repo.git');
    const { detectGitProvider } = await import('../src/git/provider.js');
    expect(detectGitProvider(dir)).toBe('other');
  });

  it('returns other when there is no origin remote', async () => {
    const gitDir = join(dir, '.git');
    mkdirSync(gitDir, { recursive: true });
    writeFileSync(join(gitDir, 'config'), '[core]\n\trepositoryformatversion = 0\n');
    const { detectGitProvider } = await import('../src/git/provider.js');
    expect(detectGitProvider(dir)).toBe('other');
  });

  it('returns other when there is no .git directory', async () => {
    const { detectGitProvider } = await import('../src/git/provider.js');
    expect(detectGitProvider(dir)).toBe('other');
  });
});

// ---------------------------------------------------------------------------
// initCommand provider routing — GitLab and self-hosted run interactive flow
// ---------------------------------------------------------------------------

const MINIMAL_ANSWERS = {
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

describe('initCommand — GitLab/self-hosted run full interactive flow (20.6.7)', () => {
  it('calls askSetupQuestions for a GitLab remote', async () => {
    const { vi } = await import('vitest');
    vi.resetModules();

    let setupQuestionsCallCount = 0;
    vi.doMock('../src/init/questions.js', () => ({
      askSetupQuestions: async () => { setupQuestionsCallCount++; return MINIMAL_ANSWERS; },
    }));
    vi.doMock('../src/commands/register.js', () => ({
      registerCommand: async () => {},
    }));

    const repoDir = makeTmpDir('il-gitlab');
    mkdirSync(join(repoDir, '.git'), { recursive: true });
    writeGitConfig(repoDir, 'https://gitlab.com/acme/my-repo.git');

    const origCwd = process.cwd();
    process.chdir(repoDir);
    try {
      const { initCommand } = await import('../src/commands/init.js');
      await initCommand({ defaults: false });
      expect(setupQuestionsCallCount).toBe(1);
    } finally {
      process.chdir(origCwd);
      rmSync(repoDir, { recursive: true, force: true });
      vi.doUnmock('../src/init/questions.js');
      vi.doUnmock('../src/commands/register.js');
      vi.resetModules();
    }
  });

  it('calls askSetupQuestions for a self-hosted remote', async () => {
    const { vi } = await import('vitest');
    vi.resetModules();

    let setupQuestionsCallCount = 0;
    vi.doMock('../src/init/questions.js', () => ({
      askSetupQuestions: async () => { setupQuestionsCallCount++; return MINIMAL_ANSWERS; },
    }));
    vi.doMock('../src/commands/register.js', () => ({
      registerCommand: async () => {},
    }));

    const repoDir = makeTmpDir('il-selfhosted');
    mkdirSync(join(repoDir, '.git'), { recursive: true });
    writeGitConfig(repoDir, 'https://git.company.internal/acme/repo.git');

    const origCwd = process.cwd();
    process.chdir(repoDir);
    try {
      const { initCommand } = await import('../src/commands/init.js');
      await initCommand({ defaults: false });
      expect(setupQuestionsCallCount).toBe(1);
    } finally {
      process.chdir(origCwd);
      rmSync(repoDir, { recursive: true, force: true });
      vi.doUnmock('../src/init/questions.js');
      vi.doUnmock('../src/commands/register.js');
      vi.resetModules();
    }
  });

  it('calls askSetupQuestions when there is no remote (no .git/config)', async () => {
    const { vi } = await import('vitest');
    vi.resetModules();

    let setupQuestionsCallCount = 0;
    vi.doMock('../src/init/questions.js', () => ({
      askSetupQuestions: async () => { setupQuestionsCallCount++; return MINIMAL_ANSWERS; },
    }));
    vi.doMock('../src/commands/register.js', () => ({
      registerCommand: async () => {},
    }));

    const repoDir = makeTmpDir('il-noremote');
    mkdirSync(join(repoDir, '.git'), { recursive: true });

    const origCwd = process.cwd();
    process.chdir(repoDir);
    try {
      const { initCommand } = await import('../src/commands/init.js');
      await initCommand({ defaults: false });
      expect(setupQuestionsCallCount).toBe(1);
    } finally {
      process.chdir(origCwd);
      rmSync(repoDir, { recursive: true, force: true });
      vi.doUnmock('../src/init/questions.js');
      vi.doUnmock('../src/commands/register.js');
      vi.resetModules();
    }
  });
});
