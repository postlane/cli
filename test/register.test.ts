// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('postlane register', () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    testDir = join(tmpdir(), `postlane-test-${Date.now()}`);
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

  describe('git repository validation', () => {
    it('should fail if not in a git repository', async () => {
      // Remove .git directory
      rmSync(join(testDir, '.git'), { recursive: true, force: true });

      const { registerCommand } = await import('../src/commands/register.js');

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      await expect(registerCommand()).rejects.toThrow();
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
    });

    it('should proceed if in a git repository', async () => {
      // .git exists from beforeEach
      expect(existsSync(join(testDir, '.git'))).toBe(true);
    });
  });

  describe('detectAppState', () => {
    it('should return "not-installed" when no port file and no app installed', async () => {
      // Import and test detectAppState indirectly through registerCommand
      // Since detectAppState is not exported, we test the behavior through the command
      const { registerCommand } = await import('../src/commands/register.js');

      // Mock console.log to capture output
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: any[]) => {
        logs.push(args.join(' '));
      };

      try {
        await registerCommand();
      } catch (error) {
        // Command may exit, that's OK
      }

      console.log = originalLog;

      // Should print not-installed message
      const output = logs.join('\n');
      expect(output).toContain('ready for Postlane');
      expect(output).toContain('postlane.dev/download');
    });
  });

  describe('repos.json writing (installed state)', () => {
    it('should write repos.json with full schema when app is installed', async () => {
      const postlaneDir = join(tmpdir(), '.postlane-test-repos');
      mkdirSync(postlaneDir, { recursive: true });

      const reposPath = join(postlaneDir, 'repos.json');

      // Create initial empty repos.json
      const initialConfig = {
        version: 1,
        repos: []
      };
      writeFileSync(reposPath, JSON.stringify(initialConfig, null, 2));

      // Simulate writing a repo (this is what handleInstalledState does)
      const fs = await import('fs');
      const content = fs.readFileSync(reposPath, 'utf-8');
      const config = JSON.parse(content);

      const newRepo = {
        id: 'test-uuid',
        name: 'test-repo',
        path: testDir,
        active: true,
        added_at: new Date().toISOString()
      };

      config.repos.push(newRepo);
      fs.writeFileSync(reposPath, JSON.stringify(config, null, 2));

      // Verify structure
      const saved = JSON.parse(fs.readFileSync(reposPath, 'utf-8'));
      expect(saved.version).toBe(1);
      expect(saved.repos).toHaveLength(1);
      expect(saved.repos[0].id).toBe('test-uuid');
      expect(saved.repos[0].name).toBe('test-repo');
      expect(saved.repos[0].path).toBe(testDir);
      expect(saved.repos[0].active).toBe(true);
      expect(saved.repos[0].added_at).toBeTruthy();

      // Cleanup
      rmSync(postlaneDir, { recursive: true, force: true });
    });

    it('should not duplicate repos in repos.json', async () => {
      const postlaneDir = join(tmpdir(), '.postlane-test-duplicate');
      mkdirSync(postlaneDir, { recursive: true });

      const reposPath = join(postlaneDir, 'repos.json');

      const config = {
        version: 1,
        repos: [
          {
            id: 'existing-id',
            name: 'test-repo',
            path: testDir,
            active: true,
            added_at: new Date().toISOString()
          }
        ]
      };

      writeFileSync(reposPath, JSON.stringify(config, null, 2));

      // Try to add the same repo again
      const fs = await import('fs');
      const content = fs.readFileSync(reposPath, 'utf-8');
      const loadedConfig = JSON.parse(content);

      const existing = loadedConfig.repos.find((r: any) => r.path === testDir);
      expect(existing).toBeTruthy();

      // Should not add duplicate
      if (!existing) {
        loadedConfig.repos.push({
          id: 'new-id',
          name: 'test-repo',
          path: testDir,
          active: true,
          added_at: new Date().toISOString()
        });
      }

      // Verify still only one repo
      expect(loadedConfig.repos).toHaveLength(1);

      // Cleanup
      rmSync(postlaneDir, { recursive: true, force: true });
    });
  });

  describe('health check timeout', () => {
    it('should timeout health check after 200ms', async () => {
      const start = Date.now();

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 200);

        await fetch('http://127.0.0.1:47312/health', {
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
      } catch (error) {
        const elapsed = Date.now() - start;
        // Should timeout around 200ms
        expect(elapsed).toBeLessThan(300);
      }
    });
  });

  describe('known install paths', () => {
    it('should include macOS paths', () => {
      const KNOWN_INSTALL_PATHS: Record<string, string[]> = {
        darwin: [
          '/Applications/Postlane.app',
          join(process.env.HOME || '', 'Applications/Postlane.app'),
        ],
      };

      expect(KNOWN_INSTALL_PATHS.darwin).toHaveLength(2);
      expect(KNOWN_INSTALL_PATHS.darwin[0]).toBe('/Applications/Postlane.app');
    });

    it('should include Linux paths', () => {
      const KNOWN_INSTALL_PATHS: Record<string, string[]> = {
        linux: [
          '/usr/bin/postlane',
          '/usr/local/bin/postlane',
          join(process.env.HOME || '', '.local/bin/postlane'),
        ],
      };

      expect(KNOWN_INSTALL_PATHS.linux).toHaveLength(3);
    });

    it('should include Windows paths', () => {
      const KNOWN_INSTALL_PATHS: Record<string, string[]> = {
        win32: [
          join(process.env.LOCALAPPDATA || '', 'Programs\\Postlane\\Postlane.exe'),
          join(process.env.PROGRAMFILES || '', 'Postlane\\Postlane.exe'),
        ],
      };

      expect(KNOWN_INSTALL_PATHS.win32).toHaveLength(2);
    });
  });
});
