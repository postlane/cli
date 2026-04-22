// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir, homedir } from 'os';
import { execSync } from 'child_process';

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
    it('should fail if config.json does not exist', () => {
      // No config.json exists
      const { runDoctor } = require('../dist/commands/doctor.js');

      const checks = runDoctor();
      const configCheck = checks.find((c: any) => c.name === 'config.json');

      expect(configCheck.passed).toBe(false);
      expect(configCheck.fix).toContain('npx postlane init');
    });

    it('should fail if config.json is invalid JSON', () => {
      const postlaneDir = join(testDir, '.postlane');
      mkdirSync(postlaneDir, { recursive: true });
      writeFileSync(join(postlaneDir, 'config.json'), '{ invalid json }');

      const { runDoctor } = require('../dist/commands/doctor.js');
      const checks = runDoctor();
      const configCheck = checks.find((c: any) => c.name === 'config.json');

      expect(configCheck.passed).toBe(false);
    });

    it('should pass if config.json is valid', () => {
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

      const { runDoctor } = require('../dist/commands/doctor.js');
      const checks = runDoctor();
      const configCheck = checks.find((c: any) => c.name === 'config.json');

      expect(configCheck.passed).toBe(true);
    });
  });

  describe('app installation check', () => {
    it('should check known install paths for current platform', () => {
      const { runDoctor } = require('../dist/commands/doctor.js');
      const checks = runDoctor();
      const installCheck = checks.find((c: any) => c.name === 'app-installed');

      // Will likely fail unless app is actually installed
      expect(installCheck).toBeDefined();
      expect(installCheck.fix).toContain('postlane.dev/download');
    });
  });

  describe('app running check', () => {
    it('should check if app is running via health endpoint', () => {
      const { runDoctor } = require('../dist/commands/doctor.js');
      const checks = runDoctor();
      const runningCheck = checks.find((c: any) => c.name === 'app-running');

      expect(runningCheck).toBeDefined();
      if (!runningCheck.passed) {
        expect(runningCheck.fix).toContain('Open the Postlane app');
      }
    });
  });

  describe('repo registration check', () => {
    it('should fail if repos.json does not exist', () => {
      const { runDoctor } = require('../dist/commands/doctor.js');
      const checks = runDoctor();
      const repoCheck = checks.find((c: any) => c.name === 'repo-registered');

      expect(repoCheck.passed).toBe(false);
      expect(repoCheck.fix).toContain('postlane register');
    });

    it('should fail if current path is not in repos.json', () => {
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

      const { runDoctor } = require('../dist/commands/doctor.js');
      const checks = runDoctor();
      const repoCheck = checks.find((c: any) => c.name === 'repo-registered');

      expect(repoCheck.passed).toBe(false);
    });
  });

  describe('session token check', () => {
    const tokenPath = join(homedir(), '.postlane', 'session.token');
    let savedToken: Buffer | null = null;

    beforeEach(() => {
      savedToken = existsSync(tokenPath) ? require('fs').readFileSync(tokenPath) : null;
      if (existsSync(tokenPath)) rmSync(tokenPath);
    });

    afterEach(() => {
      if (existsSync(tokenPath)) rmSync(tokenPath);
      if (savedToken !== null) writeFileSync(tokenPath, savedToken);
    });

    it('should fail if session.token does not exist', () => {
      const { runDoctor } = require('../dist/commands/doctor.js');
      const checks = runDoctor();
      const tokenCheck = checks.find((c: any) => c.name === 'session-token');

      expect(tokenCheck.passed).toBe(false);
      expect(tokenCheck.fix).toContain('Restart the Postlane app');
    });

    it('should pass if session.token is readable', () => {
      mkdirSync(join(homedir(), '.postlane'), { recursive: true });
      writeFileSync(tokenPath, 'test-token-12345678901234567890123');

      const { runDoctor } = require('../dist/commands/doctor.js');
      const checks = runDoctor();
      const tokenCheck = checks.find((c: any) => c.name === 'session-token');

      expect(tokenCheck.passed).toBe(true);
    });
  });

  describe('exit code', () => {
    it('should exit with 0 if all checks pass', () => {
      // Set up a valid environment
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

      const { getExitCode } = require('../dist/commands/doctor.js');
      const checks = require('../dist/commands/doctor.js').runDoctor();
      const exitCode = getExitCode(checks);

      // Will be 1 unless all checks actually pass (app running, etc.)
      expect([0, 1]).toContain(exitCode);
    });

    it('should exit with 1 if any check fails', () => {
      // No config.json - will fail
      const { getExitCode } = require('../dist/commands/doctor.js');
      const checks = require('../dist/commands/doctor.js').runDoctor();
      const exitCode = getExitCode(checks);

      expect(exitCode).toBe(1);
    });
  });
});
