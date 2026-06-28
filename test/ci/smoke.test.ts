// SPDX-License-Identifier: BUSL-1.1
//
// Smoke tests — only run in CI with CI_SMOKE_TESTS=true.
// Locally: npx vitest run → all scenarios show as skipped, exit 0 (23.3.15).
// CI: smoke.yml injects CI_GITHUB_SESSION_TOKEN + CI_GITLAB_SESSION_TOKEN and sets CI_SMOKE_TESTS=true.
//
// Prerequisites (must be set up before these tests pass in CI):
//   23.3.1 — postlane-ci-test GitHub org with Postlane App + smoke-test-repo
//   23.3.2 — postlane-ci-test GitLab group with smoke-test-repo + access token
//   23.3.3 — CI_GITHUB_SESSION_TOKEN + CI_GITLAB_SESSION_TOKEN repo secrets
//
// 23.6.3 smoke gate verification: setting project_id: null in mock-desktop-server.ts causes
// smoke_init_github to fail; the beta branch ruleset blocks that PR from merging to beta,
// and blocks any beta→main PR until smoke passes again on beta.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync, spawn } from 'child_process';
import {
  existsSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync, unlinkSync, rmSync,
} from 'fs';
import { join } from 'path';
import { homedir, tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { start, stop } from './mock-desktop-server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI = join(__dirname, '..', '..', 'dist', 'index.js');

const POSTLANE_DIR = join(homedir(), '.postlane');
const PORT_FILE = join(POSTLANE_DIR, 'port');
const TOKEN_FILE = join(POSTLANE_DIR, 'session.token');

// Skip if CI_SMOKE_TESTS is not set OR if the required token is absent (infrastructure pending).
// Once 23.3.1–23.3.3 are complete and CI secrets are added, this guard resolves to false and tests run.
const shouldRunSmoke = !!(process.env.CI_SMOKE_TESTS && process.env.CI_GITHUB_SESSION_TOKEN);

// Runs the CLI in a child process without blocking the event loop.
// spawnSync blocks the parent's event loop, preventing the mock HTTP server from
// processing incoming connections from the CLI subprocess. Using spawn keeps the
// event loop alive so the mock server can respond while the CLI subprocess runs.
function runCLI(args: string[], cwd: string): Promise<{ status: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('node', [CLI, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf-8'); });
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf-8'); });
    child.on('close', (code: number | null) => {
      resolve({ status: code ?? 1, stdout, stderr });
    });
  });
}

describe.skipIf(!shouldRunSmoke)('CLI smoke tests', () => {
  let savedPort: Buffer | null = null;
  let savedToken: Buffer | null = null;

  beforeAll(async () => {
    const githubToken = process.env.CI_GITHUB_SESSION_TOKEN;
    if (!githubToken) return; // shouldRunSmoke guarantees this, but required for type narrowing

    savedPort = existsSync(PORT_FILE) ? readFileSync(PORT_FILE) : null;
    savedToken = existsSync(TOKEN_FILE) ? readFileSync(TOKEN_FILE) : null;

    mkdirSync(POSTLANE_DIR, { recursive: true });
    await start(); // writes port to ~/.postlane/port
    writeFileSync(TOKEN_FILE, githubToken, { mode: 0o600 });
  });

  afterAll(async () => {
    await stop();

    if (savedPort !== null) {
      writeFileSync(PORT_FILE, savedPort, { mode: 0o600 });
    } else if (existsSync(PORT_FILE)) {
      unlinkSync(PORT_FILE);
    }

    if (savedToken !== null) {
      writeFileSync(TOKEN_FILE, savedToken, { mode: 0o600 });
    } else if (existsSync(TOKEN_FILE)) {
      unlinkSync(TOKEN_FILE);
    }
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // 23.3.6 — smoke_init_github
  // ──────────────────────────────────────────────────────────────────────────────

  it('smoke_init_github: writes config.json with project_id from mock server and exits 0', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'smoke-github-'));
    try {
      spawnSync('git', ['init'], { cwd: tmpDir });
      spawnSync('git', ['config', 'user.email', 'ci@postlane.dev'], { cwd: tmpDir });
      spawnSync('git', ['config', 'user.name', 'CI'], { cwd: tmpDir });
      spawnSync('git', ['remote', 'add', 'origin',
        'https://github.com/postlane-ci-test/smoke-test-repo.git'], { cwd: tmpDir });

      const result = await runCLI(['init'], tmpDir);

      if (result.status !== 0) {
        console.error(`[smoke_init_github] exit ${result.status}`);
        console.error(`[smoke_init_github] stdout: ${result.stdout}`);
        console.error(`[smoke_init_github] stderr: ${result.stderr}`);
      }
      expect(result.status).toBe(0);
      const configPath = join(tmpDir, '.postlane', 'config.json');
      expect(existsSync(configPath)).toBe(true);
      const config = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      expect(config.project_id).toBe('ci-test-project-id');

      // No .postlane/ created outside the temp clone
      const otherPostlane = join(tmpDir, '..', '.postlane');
      expect(existsSync(otherPostlane)).toBe(false);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // 23.3.7 — smoke_init_gitlab
  // ──────────────────────────────────────────────────────────────────────────────

  // H2/H3: async + it.skipIf so the mock server's event loop is not blocked and
  // the test is correctly reported as SKIPPED (not PASSED) when the token is absent.
  it.skipIf(!process.env.CI_GITLAB_SESSION_TOKEN)(
    'smoke_init_gitlab: writes config.json for GitLab repo with --defaults and exits 0',
    async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'smoke-gitlab-'));
      try {
        spawnSync('git', ['init'], { cwd: tmpDir });
        spawnSync('git', ['config', 'user.email', 'ci@postlane.dev'], { cwd: tmpDir });
        spawnSync('git', ['config', 'user.name', 'CI'], { cwd: tmpDir });
        spawnSync('git', ['remote', 'add', 'origin',
          'https://gitlab.com/postlane-ci-test/smoke-test-repo.git'], { cwd: tmpDir });

        const result = await runCLI(['init', '--defaults'], tmpDir);

        expect(result.status).toBe(0);
        const configPath = join(tmpDir, '.postlane', 'config.json');
        expect(existsSync(configPath)).toBe(true);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    },
  );

  // ──────────────────────────────────────────────────────────────────────────────
  // 23.3.8 — smoke_init_no_session
  // ──────────────────────────────────────────────────────────────────────────────

  it('smoke_init_no_session: exits 1 with sign-in instruction when session token is absent', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'smoke-no-session-'));
    if (!existsSync(TOKEN_FILE)) throw new Error(`Expected session token at ${TOKEN_FILE} — beforeAll may not have run`)
    const savedTokenContent = readFileSync(TOKEN_FILE);
    unlinkSync(TOKEN_FILE);
    try {
      spawnSync('git', ['init'], { cwd: tmpDir });
      spawnSync('git', ['remote', 'add', 'origin',
        'https://github.com/postlane-ci-test/smoke-test-repo.git'], { cwd: tmpDir });

      const result = spawnSync('node', [CLI, 'init'], {
        cwd: tmpDir,
        encoding: 'utf-8',
      });

      expect(result.status).toBe(1);
      const stderr = result.stderr ?? '';
      expect(stderr).toMatch(/sign in to postlane/i);
      // Recovery instruction — must tell user what to do next
      expect(stderr).toMatch(/open the postlane desktop app|postlane app/i);
      // No config.json written on failure
      expect(existsSync(join(tmpDir, '.postlane', 'config.json'))).toBe(false);
    } finally {
      writeFileSync(TOKEN_FILE, savedTokenContent, { mode: 0o600 });
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // 23.3.9 — smoke_init_non_git
  // ──────────────────────────────────────────────────────────────────────────────

  it('smoke_init_non_git: exits 1 with "not a git repository" when .git is not a directory', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'smoke-non-git-'));
    try {
      // A .git FILE (not directory) simulates a broken/submodule reference.
      // This makes validateEnvironment() report "not a git repository" and exit 1.
      writeFileSync(join(tmpDir, '.git'), 'gitdir: ../phantom/.git\n', 'utf-8');

      const result = spawnSync('node', [CLI, 'init'], {
        cwd: tmpDir,
        encoding: 'utf-8',
      });

      expect(result.status).toBe(1);
      const stderr = result.stderr ?? '';
      expect(stderr).toMatch(/is not a git repository/i);
      // Recovery suggestion must be present
      expect(stderr).toMatch(/git repo|git init|workspace root/i);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // 23.3.10 — smoke_register
  // ──────────────────────────────────────────────────────────────────────────────

  it('smoke_register: exits 0 and is idempotent when run twice in a registered repo', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'smoke-register-'));
    try {
      spawnSync('git', ['init'], { cwd: tmpDir });
      spawnSync('git', ['config', 'user.email', 'ci@postlane.dev'], { cwd: tmpDir });
      spawnSync('git', ['config', 'user.name', 'CI'], { cwd: tmpDir });

      // Write a minimal config.json so the repo looks initialised
      const postlaneDir = join(tmpDir, '.postlane');
      mkdirSync(postlaneDir, { recursive: true });
      writeFileSync(join(postlaneDir, 'config.json'), JSON.stringify({
        version: 1,
        project_id: 'ci-test-project-id',
        llm: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
        repo_type: 'open-source-library',
        style: 'Direct.',
        utm_campaign: '',
        author: 'CI',
      }, null, 2), 'utf-8');

      const first = spawnSync('node', [CLI, 'register'], { cwd: tmpDir, encoding: 'utf-8' });
      expect(first.status).toBe(0);

      const second = spawnSync('node', [CLI, 'register'], { cwd: tmpDir, encoding: 'utf-8' });
      expect(second.status).toBe(0);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // 23.3.11 — smoke_doctor
  // ──────────────────────────────────────────────────────────────────────────────

  it('smoke_doctor: all checks pass and exits 0 in a correctly configured repo', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'smoke-doctor-'));
    const localBin = join(homedir(), '.local', 'bin', 'postlane');
    const localBinCreated = !existsSync(localBin);
    const reposFile = join(POSTLANE_DIR, 'repos.json');
    const savedRepos = existsSync(reposFile) ? readFileSync(reposFile) : null;

    try {
      // Simulate the Postlane app binary being installed (Linux CI path)
      if (process.platform === 'linux') {
        mkdirSync(join(homedir(), '.local', 'bin'), { recursive: true });
        if (!existsSync(localBin)) {
          writeFileSync(localBin, '#!/bin/sh\necho postlane\n', { mode: 0o755 });
        }
      }

      // Run init first so all config files and skill files are in place
      spawnSync('git', ['init'], { cwd: tmpDir });
      spawnSync('git', ['config', 'user.email', 'ci@postlane.dev'], { cwd: tmpDir });
      spawnSync('git', ['config', 'user.name', 'CI'], { cwd: tmpDir });
      spawnSync('git', ['remote', 'add', 'origin',
        'https://github.com/postlane-ci-test/smoke-test-repo.git'], { cwd: tmpDir });
      await runCLI(['init'], tmpDir);

      // When the app is running, handleRunningState sends to the app (does not write repos.json locally).
      // Write repos.json manually so checkRepoRegistered passes.
      writeFileSync(reposFile, JSON.stringify({
        version: 1,
        repos: [{
          id: 'ci-smoke-test-id',
          name: 'smoke-doctor',
          path: tmpDir,
          active: true,
          added_at: new Date().toISOString(),
        }],
      }, null, 2), { mode: 0o600 });

      const result = await runCLI(['doctor'], tmpDir);

      expect(result.status).toBe(0);
      const stdout = result.stdout ?? '';
      expect(stdout).toContain('All checks passed');
    } finally {
      // Restore repos.json
      if (savedRepos !== null) {
        writeFileSync(reposFile, savedRepos, { mode: 0o600 });
      } else if (existsSync(reposFile)) {
        unlinkSync(reposFile);
      }

      // Remove dummy binary if we created it
      if (process.platform === 'linux' && localBinCreated && existsSync(localBin)) {
        unlinkSync(localBin);
      }

      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
