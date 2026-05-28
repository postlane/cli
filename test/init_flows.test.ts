// SPDX-License-Identifier: BUSL-1.1
// Isolation tests for extracted initCommand flow functions (Task 4)

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

function makeTmpDir(): string {
  const dir = join(tmpdir(), `postlane-init-flows-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('validateEnvironment', () => {
  it('is exported from src/commands/init.ts', async () => {
    const mod = await import('../src/commands/init.js');
    expect(typeof mod.validateEnvironment).toBe('function');
  });

  it('calls process.exit(1) when Node major version < 18', async () => {
    vi.resetModules();
    const originalVersion = process.version;
    Object.defineProperty(process, 'version', { value: 'v16.0.0', configurable: true });

    const exitMessages: string[] = [];
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      exitMessages.push(args.map(String).join(' '));
    });
    let exitCode: number | undefined;
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      exitCode = code as number;
      throw new Error('exit');
    });

    try {
      const { validateEnvironment } = await import('../src/commands/init.js');
      validateEnvironment('/tmp');
    } catch {
      // swallow process.exit throw
    }

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
    Object.defineProperty(process, 'version', { value: originalVersion, configurable: true });
    vi.resetModules();

    expect(exitCode).toBe(1);
    expect(exitMessages.join('\n')).toMatch(/Node\.js >= 18/);
  });

  it('rejects a directory where .git is a symlink', async () => {
    vi.resetModules();
    const tmpDir = makeTmpDir();
    const realGit = makeTmpDir();
    const { symlinkSync } = await import('fs');
    symlinkSync(realGit, join(tmpDir, '.git'));

    const errorMessages: string[] = [];
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      errorMessages.push(args.map(String).join(' '));
    });
    let exitCode: number | undefined;
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      exitCode = code as number;
      throw new Error('exit');
    });

    try {
      const { validateEnvironment } = await import('../src/commands/init.js');
      validateEnvironment(tmpDir);
    } catch {
      // swallow
    }

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
    rmSync(tmpDir, { recursive: true, force: true });
    rmSync(realGit, { recursive: true, force: true });
    vi.resetModules();

    expect(exitCode).toBe(1);
    expect(errorMessages.join('\n')).toMatch(/not a git repository/i);
  });

  it('accepts a directory with a real .git folder', async () => {
    vi.resetModules();
    const tmpDir = makeTmpDir();
    mkdirSync(join(tmpDir, '.git'), { recursive: true });

    let exitCode: number | undefined;
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      exitCode = code as number;
      throw new Error('exit');
    });

    try {
      const { validateEnvironment } = await import('../src/commands/init.js');
      validateEnvironment(tmpDir);
    } catch {
      // ignore
    }

    exitSpy.mockRestore();
    rmSync(tmpDir, { recursive: true, force: true });
    vi.resetModules();

    expect(exitCode).toBeUndefined();
  });
});

describe('handleExistingConfig', () => {
  it('is exported from src/commands/init.ts', async () => {
    const mod = await import('../src/commands/init.js');
    expect(typeof mod.handleExistingConfig).toBe('function');
  });

  it('calls registerCommand when user picks "register" on complete init', async () => {
    vi.resetModules();

    let registerCalled = false;
    vi.doMock('../src/commands/register.js', () => ({
      registerCommand: async () => { registerCalled = true; },
    }));
    vi.doMock('inquirer', () => ({
      default: { prompt: async () => ({ action: 'register' }) },
    }));

    const tmpDir = makeTmpDir();
    mkdirSync(join(tmpDir, '.postlane'), { recursive: true });
    writeFileSync(join(tmpDir, '.postlane', 'config.json'), '{}');
    mkdirSync(join(tmpDir, '.claude', 'commands'), { recursive: true });
    writeFileSync(join(tmpDir, '.claude', 'commands', 'draft-post.md'), '');
    writeFileSync(join(tmpDir, '.claude', 'commands', 'register-repo.md'), '');

    let returnValue: string | undefined;
    try {
      const { handleExistingConfig } = await import('../src/commands/init.js');
      returnValue = await handleExistingConfig(tmpDir, 'complete');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
      vi.doUnmock('../src/commands/register.js');
      vi.doUnmock('inquirer');
      vi.resetModules();
    }

    expect(registerCalled).toBe(true);
    expect(returnValue).toBe('done');
  });

  it('returns "continue" when user picks "overwrite" on complete init', async () => {
    vi.resetModules();
    vi.doMock('inquirer', () => ({
      default: { prompt: async () => ({ action: 'overwrite' }) },
    }));

    const tmpDir = makeTmpDir();
    mkdirSync(join(tmpDir, '.postlane'), { recursive: true });
    writeFileSync(join(tmpDir, '.postlane', 'config.json'), '{}');

    let returnValue: string | undefined;
    try {
      const { handleExistingConfig } = await import('../src/commands/init.js');
      returnValue = await handleExistingConfig(tmpDir, 'complete');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
      vi.doUnmock('inquirer');
      vi.resetModules();
    }

    expect(returnValue).toBe('continue');
  });

  it('returns null when initStatus is "none"', async () => {
    const { handleExistingConfig } = await import('../src/commands/init.js');
    const tmpDir = makeTmpDir();
    const result = await handleExistingConfig(tmpDir, 'none');
    rmSync(tmpDir, { recursive: true, force: true });
    expect(result).toBeNull();
  });
});

describe('setupGitHubFlow', () => {
  it('is exported from src/commands/init.ts', async () => {
    const mod = await import('../src/commands/init.js');
    expect(typeof mod.setupGitHubFlow).toBe('function');
  });

  it('calls process.exit(1) when no app session exists', async () => {
    vi.resetModules();
    vi.doMock('../src/git/github_session.js', () => ({
      readAppSessionInfo: () => null,
      fetchGitHubProjectConfig: async () => null,
    }));

    const errorMessages: string[] = [];
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      errorMessages.push(args.map(String).join(' '));
    });
    let exitCode: number | undefined;
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      exitCode = code as number;
      throw new Error('exit');
    });

    try {
      const { setupGitHubFlow } = await import('../src/commands/init.js');
      await setupGitHubFlow('/some/dir');
    } catch {
      // swallow
    }

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
    vi.doUnmock('../src/git/github_session.js');
    vi.resetModules();

    expect(exitCode).toBe(1);
    expect(errorMessages.join('\n')).toMatch(/Sign in to Postlane/i);
  });
});

describe('setupInteractiveFlow', () => {
  it('is exported from src/commands/init.ts', async () => {
    const mod = await import('../src/commands/init.js');
    expect(typeof mod.setupInteractiveFlow).toBe('function');
  });

  it('calls writeConfigFiles and registerCommand', async () => {
    vi.resetModules();

    let configWritten = false;
    let registerCalled = false;

    vi.doMock('../src/init/questions.js', () => ({
      askSetupQuestions: async () => ({
        llmProvider: 'anthropic', llmModel: 'claude-sonnet-4-6',
        schedulerProvider: 'zernio', schedulerApiKey: '',
        repoType: 'open-source-library', style: 'Direct.',
        utmCampaign: '', author: 'Test',
      }),
    }));
    vi.doMock('../src/init/config_writer.js', () => ({
      writeConfigFiles: () => { configWritten = true; },
      patchProjectId: () => {},
    }));
    vi.doMock('../src/commands/register.js', () => ({
      registerCommand: async () => { registerCalled = true; },
    }));
    vi.doMock('../src/git/github_session.js', () => ({
      readAppSessionInfo: () => null,
      fetchGitHubProjectConfig: async () => null,
    }));
    vi.doMock('../src/git/provider.js', () => ({
      extractOrgLogin: () => null,
    }));

    const tmpDir = makeTmpDir();
    mkdirSync(join(tmpDir, '.git'), { recursive: true });

    try {
      const { setupInteractiveFlow } = await import('../src/commands/init.js');
      await setupInteractiveFlow(tmpDir, false, false);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
      vi.doUnmock('../src/init/questions.js');
      vi.doUnmock('../src/init/config_writer.js');
      vi.doUnmock('../src/commands/register.js');
      vi.doUnmock('../src/git/github_session.js');
      vi.doUnmock('../src/git/provider.js');
      vi.resetModules();
    }

    expect(configWritten).toBe(true);
    expect(registerCalled).toBe(true);
  });
});
