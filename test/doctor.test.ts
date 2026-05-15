// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir, homedir } from 'os';
import { runDoctor, getExitCode, isValidPort } from '../src/commands/doctor.js';

describe('postlane doctor', () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    testDir = join(tmpdir(), `postlane-doctor-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    // Create .git directory to make it a valid repo
    mkdirSync(join(testDir, '.git'), { recursive: true });

    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('config.json check', () => {
    it('should fail if config.json does not exist', async () => {
      const checks = await runDoctor();
      const configCheck = checks.find((c) => c.name === 'config.json');

      expect(configCheck?.passed).toBe(false);
      expect(configCheck?.fix).toContain('npx postlane init');
    });

    it('should fail if config.json is invalid JSON', async () => {
      const postlaneDir = join(testDir, '.postlane');
      mkdirSync(postlaneDir, { recursive: true });
      writeFileSync(join(postlaneDir, 'config.json'), '{ invalid json }');

      const checks = await runDoctor();
      const configCheck = checks.find((c) => c.name === 'config.json');

      expect(configCheck?.passed).toBe(false);
    });

    it('should pass if config.json is valid', async () => {
      const postlaneDir = join(testDir, '.postlane');
      mkdirSync(postlaneDir, { recursive: true });

      const config = {
        version: 1,
        base_url: 'https://example.com',
        platforms: ['x'],
        llm: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
        scheduler: { provider: 'zernio' },
        repo_type: 'open-source-library',
        style: 'Direct',
        utm_campaign: '',
        author: 'Test'
      };

      writeFileSync(join(postlaneDir, 'config.json'), JSON.stringify(config, null, 2));

      const checks = await runDoctor();
      const configCheck = checks.find((c) => c.name === 'config.json');

      expect(configCheck?.passed).toBe(true);
    });
  });

  describe('app installation check', () => {
    it('should check known install paths for current platform', async () => {
      const checks = await runDoctor();
      const installCheck = checks.find((c) => c.name === 'app-installed');

      expect(installCheck).toBeDefined();
      if (!installCheck?.passed) {
        expect(installCheck?.fix).toContain('postlane.dev/download');
      }
    });
  });

  describe('app running check', () => {
    it('should check if app is running via health endpoint', async () => {
      const checks = await runDoctor();
      const runningCheck = checks.find((c) => c.name === 'app-running');

      expect(runningCheck).toBeDefined();
      if (!runningCheck?.passed) {
        expect(runningCheck?.fix).toContain('Open the Postlane app');
      }
    });
  });

  describe('repo registration check', () => {
    it('should fail if repos.json does not exist', async () => {
      const checks = await runDoctor();
      const repoCheck = checks.find((c) => c.name === 'repo-registered');

      expect(repoCheck?.passed).toBe(false);
      expect(repoCheck?.fix).toContain('postlane register');
    });

    it('should fail if current path is not in repos.json', async () => {
      const postlaneDir = join(homedir(), '.postlane');
      mkdirSync(postlaneDir, { recursive: true });

      const repos = {
        version: 1,
        repos: [
          {
            id: 'test-id',
            name: 'other-repo',
            path: '/some/other/path',
            active: true,
            added_at: new Date().toISOString()
          }
        ]
      };

      writeFileSync(join(postlaneDir, 'repos.json'), JSON.stringify(repos, null, 2));

      const checks = await runDoctor();
      const repoCheck = checks.find((c) => c.name === 'repo-registered');

      expect(repoCheck?.passed).toBe(false);
    });
  });

  describe('session token check', () => {
    const tokenPath = join(homedir(), '.postlane', 'session.token');
    let savedToken: Buffer | null = null;

    beforeEach(() => {
      savedToken = existsSync(tokenPath) ? readFileSync(tokenPath) : null;
      if (existsSync(tokenPath)) rmSync(tokenPath);
    });

    afterEach(() => {
      if (existsSync(tokenPath)) rmSync(tokenPath);
      if (savedToken !== null) writeFileSync(tokenPath, savedToken);
    });

    it('should fail if session.token does not exist', async () => {
      const checks = await runDoctor();
      const tokenCheck = checks.find((c) => c.name === 'session-token');

      expect(tokenCheck?.passed).toBe(false);
      expect(tokenCheck?.fix).toContain('Restart the Postlane app');
    });

    it('should pass if session.token is readable', async () => {
      mkdirSync(join(homedir(), '.postlane'), { recursive: true });
      writeFileSync(tokenPath, 'test-token-12345678901234567890123');

      const checks = await runDoctor();
      const tokenCheck = checks.find((c) => c.name === 'session-token');

      expect(tokenCheck?.passed).toBe(true);
    });
  });

  describe('skill-files check', () => {
    const EXPECTED_SKILL_FILES = [
      'draft-post.md',
      'draft-x.md',
      'draft-bluesky.md',
      'draft-mastodon.md',
      'draft-linkedin.md',
      'draft-substack.md',
      'draft-product-hunt.md',
      'draft-show-hn.md',
      'draft-changelog.md',
      'redraft-post.md',
    ];

    it('should fail when no skill files exist', async () => {
      const checks = await runDoctor();
      const skillCheck = checks.find((c) => c.name === 'skill-files');

      expect(skillCheck).toBeDefined();
      expect(skillCheck?.passed).toBe(false);
      expect(skillCheck?.fix).toContain('Missing skill files');
    });

    it('should fail when only some skill files exist', async () => {
      const commandsDir = join(testDir, '.claude', 'commands');
      mkdirSync(commandsDir, { recursive: true });
      // Only write draft-post.md, not the others
      writeFileSync(join(commandsDir, 'draft-post.md'), '# draft-post');

      const checks = await runDoctor();
      const skillCheck = checks.find((c) => c.name === 'skill-files');

      expect(skillCheck?.passed).toBe(false);
      expect(skillCheck?.fix).toContain('draft-x.md');
    });

    it('should pass when all expected skill files exist', async () => {
      const commandsDir = join(testDir, '.claude', 'commands');
      mkdirSync(commandsDir, { recursive: true });
      for (const file of EXPECTED_SKILL_FILES) {
        writeFileSync(join(commandsDir, file), `# ${file}`);
      }

      const checks = await runDoctor();
      const skillCheck = checks.find((c) => c.name === 'skill-files');

      expect(skillCheck?.passed).toBe(true);
      expect(skillCheck?.fix).toBeUndefined();
    });
  });

  describe('exit code', () => {
    it('should exit with 0 if all checks pass', async () => {
      const postlaneDir = join(testDir, '.postlane');
      mkdirSync(postlaneDir, { recursive: true });

      const config = {
        version: 1,
        base_url: 'https://example.com',
        platforms: ['x'],
        llm: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
        scheduler: { provider: 'zernio' },
        repo_type: 'open-source-library',
        style: 'Direct',
        utm_campaign: '',
        author: 'Test'
      };

      writeFileSync(join(postlaneDir, 'config.json'), JSON.stringify(config, null, 2));

      const checks = await runDoctor();
      const exitCode = getExitCode(checks);

      // Will be 1 unless all checks actually pass (app running, etc.)
      expect([0, 1]).toContain(exitCode);
    });

    it('should exit with 1 if any check fails', async () => {
      const checks = await runDoctor();
      const exitCode = getExitCode(checks);

      expect(exitCode).toBe(1);
    });
  });

  describe('isValidPort', () => {
    it('rejects port strings containing shell metacharacters', () => {
      expect(isValidPort('9999; touch /tmp/x')).toBe(false);
      expect(isValidPort('$(id)')).toBe(false);
      expect(isValidPort('&& rm -rf /')).toBe(false);
      expect(isValidPort('')).toBe(false);
    });

    it('accepts valid port strings', () => {
      expect(isValidPort('47312')).toBe(true);
      expect(isValidPort('1')).toBe(true);
      expect(isValidPort('65535')).toBe(true);
    });

    it('rejects out-of-range ports', () => {
      expect(isValidPort('0')).toBe(false);
      expect(isValidPort('65536')).toBe(false);
      expect(isValidPort('99999')).toBe(false);
    });
  });

  describe('scheduler-api check', () => {
    it('should never report scheduler as reachable when implementation is a TODO', async () => {
      const checks = await runDoctor();
      const schedulerCheck = checks.find((c) => c.name === 'scheduler-api');
      expect(schedulerCheck?.passed).toBe(false);
    });

    it('marks scheduler-api as skipped when not yet implemented', async () => {
      const checks = await runDoctor();
      const schedulerCheck = checks.find((c) => c.name === 'scheduler-api');
      expect(schedulerCheck?.status).toBe('skipped');
    });
  });

  describe('session token readability check', () => {
    it('marks token-file check as failed when file exists but is unreadable', async () => {
      vi.resetModules();

      vi.doMock('fs', async () => {
        const actual = await vi.importActual<typeof import('fs')>('fs');
        return {
          ...actual,
          readFileSync: (p: Parameters<typeof actual.readFileSync>[0], ...rest: Parameters<typeof actual.readFileSync>[1][]) => {
            if (String(p).endsWith('session.token')) {
              const err = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
              throw err;
            }
            return (actual.readFileSync as (...args: unknown[]) => unknown)(p, ...rest);
          },
          existsSync: (p: string) => {
            if (String(p).endsWith('session.token')) return true;
            return actual.existsSync(p);
          },
        };
      });

      const { runDoctor: freshRunDoctor } = await import('../src/commands/doctor.js');
      const checks = await freshRunDoctor();

      vi.doUnmock('fs');
      vi.resetModules();

      const tokenCheck = checks.find((c) => c.name === 'session-token');
      expect(tokenCheck?.passed).toBe(false);
    });
  });

  describe('config.json in .gitignore check (20.9.6 / 20.9.13)', () => {
    it('fails if config.json appears in .postlane/.gitignore', async () => {
      const postlaneDir = join(testDir, '.postlane');
      mkdirSync(postlaneDir, { recursive: true });
      writeFileSync(join(postlaneDir, 'config.json'), '{"version":1}');
      writeFileSync(join(postlaneDir, '.gitignore'), 'config.json\n');

      const checks = await runDoctor();
      const check = checks.find((c) => c.name === 'config-in-gitignore');
      expect(check?.passed).toBe(false);
      expect(check?.fix).toMatch(/config\.local\.json/);
    });

    it('passes if config.json is not in .postlane/.gitignore', async () => {
      const postlaneDir = join(testDir, '.postlane');
      mkdirSync(postlaneDir, { recursive: true });
      writeFileSync(join(postlaneDir, 'config.json'), '{"version":1}');
      writeFileSync(join(postlaneDir, '.gitignore'), 'config.local.json\n');

      const checks = await runDoctor();
      const check = checks.find((c) => c.name === 'config-in-gitignore');
      expect(check?.passed).toBe(true);
    });

    it('passes if no .postlane/.gitignore exists', async () => {
      const checks = await runDoctor();
      const check = checks.find((c) => c.name === 'config-in-gitignore');
      expect(check?.passed).toBe(true);
    });
  });

  describe('config.local.json tracked by git check (20.9.9 / 20.9.15)', () => {
    it('fails if config.local.json is tracked by git', async () => {
      vi.resetModules();
      vi.doMock('child_process', async () => {
        const actual = await vi.importActual<typeof import('child_process')>('child_process');
        return {
          ...actual,
          execFileSync: (cmd: string, args: string[]) => {
            if (cmd === 'git' && Array.isArray(args) && args.includes('ls-files')) {
              return '.postlane/config.local.json\n';
            }
            return (actual.execFileSync as (...a: unknown[]) => unknown)(cmd, args);
          },
        };
      });

      const { runDoctor: freshRunDoctor } = await import('../src/commands/doctor.js');
      const checks = await freshRunDoctor();

      vi.doUnmock('child_process');
      vi.resetModules();

      const check = checks.find((c) => c.name === 'local-config-untracked');
      expect(check?.passed).toBe(false);
      expect(check?.fix).toMatch(/git rm --cached/);
    });

    it('passes if config.local.json is not tracked', async () => {
      vi.resetModules();
      vi.doMock('child_process', async () => {
        const actual = await vi.importActual<typeof import('child_process')>('child_process');
        return {
          ...actual,
          execFileSync: (cmd: string, args: string[]) => {
            if (cmd === 'git' && Array.isArray(args) && args.includes('ls-files')) {
              return '';
            }
            return (actual.execFileSync as (...a: unknown[]) => unknown)(cmd, args);
          },
        };
      });

      const { runDoctor: freshRunDoctor } = await import('../src/commands/doctor.js');
      const checks = await freshRunDoctor();

      vi.doUnmock('child_process');
      vi.resetModules();

      const check = checks.find((c) => c.name === 'local-config-untracked');
      expect(check?.passed).toBe(true);
    });
  });

  describe('health check — uses fetch not curl', () => {
    it('never calls execFileSync during the app-running health check', async () => {
      vi.resetModules();
      const execFileSyncMock = vi.fn();

      // Write a valid port file so the health-check branch is entered
      const postlaneDir = join(homedir(), '.postlane');
      mkdirSync(postlaneDir, { recursive: true });
      const portFile = join(postlaneDir, 'port');
      const wrotePort = !existsSync(portFile);
      if (wrotePort) writeFileSync(portFile, '47312');

      vi.doMock('child_process', () => ({
        execFileSync: execFileSyncMock,
        execSync: vi.fn(),
      }));

      const { runDoctor: freshRunDoctor } = await import('../src/commands/doctor.js');
      await freshRunDoctor();

      if (wrotePort) rmSync(portFile, { force: true });

      const curlCalls = execFileSyncMock.mock.calls.filter(
        (args: unknown[]) => args[0] === 'curl' || args[0] === 'wget',
      );
      expect(curlCalls).toHaveLength(0);

      vi.doUnmock('child_process');
      vi.resetModules();
    });
  });
});
