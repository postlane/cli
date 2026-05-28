// SPDX-License-Identifier: BUSL-1.1
// Isolation tests for each extracted runDoctor check function (Task 3)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  checkConfig,
  checkAppInstalled,
  checkSkillFiles,
  checkGitIgnore,
  checkLocalConfigTracked,
  checkRepoRegistered,
} from '../src/commands/doctor.js';

function makeTmpDir(): string {
  const dir = join(tmpdir(), `postlane-dc-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('checkConfig', () => {
  let dir: string;
  beforeEach(() => { dir = makeTmpDir(); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('fails when .postlane/config.json is absent', () => {
    const result = checkConfig(dir);
    expect(result.passed).toBe(false);
    expect(result.fix).toMatch(/npx postlane init/);
  });

  it('fails when .postlane/config.json is invalid JSON', () => {
    mkdirSync(join(dir, '.postlane'), { recursive: true });
    writeFileSync(join(dir, '.postlane', 'config.json'), '{ bad json }');
    const result = checkConfig(dir);
    expect(result.passed).toBe(false);
  });

  it('passes when .postlane/config.json is valid JSON', () => {
    mkdirSync(join(dir, '.postlane'), { recursive: true });
    writeFileSync(join(dir, '.postlane', 'config.json'), '{"version":1}');
    const result = checkConfig(dir);
    expect(result.passed).toBe(true);
    expect(result.fix).toBeUndefined();
  });

  it('returns check name "config.json"', () => {
    const result = checkConfig(dir);
    expect(result.name).toBe('config.json');
  });
});

describe('checkAppInstalled', () => {
  it('returns a check with name "app-installed"', () => {
    const result = checkAppInstalled();
    expect(result.name).toBe('app-installed');
  });

  it('returns a fix pointing to the download URL when not installed', () => {
    const result = checkAppInstalled();
    if (!result.passed) {
      expect(result.fix).toContain('postlane.dev/download');
    }
  });
});

describe('checkSkillFiles', () => {
  let dir: string;
  beforeEach(() => { dir = makeTmpDir(); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('fails when no skill files exist', () => {
    const result = checkSkillFiles(dir);
    expect(result.passed).toBe(false);
    expect(result.fix).toContain('Missing skill files');
  });

  it('passes when all expected skill files exist', () => {
    const commandsDir = join(dir, '.claude', 'commands');
    mkdirSync(commandsDir, { recursive: true });
    const files = [
      'draft-post.md', 'register-repo.md', 'draft-x.md', 'draft-bluesky.md',
      'draft-mastodon.md', 'draft-linkedin.md', 'draft-substack.md',
      'draft-product-hunt.md', 'draft-show-hn.md', 'draft-changelog.md',
      'redraft-post.md',
    ];
    for (const f of files) writeFileSync(join(commandsDir, f), `# ${f}`);
    const result = checkSkillFiles(dir);
    expect(result.passed).toBe(true);
    expect(result.fix).toBeUndefined();
  });

  it('lists the missing files in the fix message', () => {
    const commandsDir = join(dir, '.claude', 'commands');
    mkdirSync(commandsDir, { recursive: true });
    writeFileSync(join(commandsDir, 'draft-post.md'), '# draft-post');
    const result = checkSkillFiles(dir);
    expect(result.fix).toContain('draft-x.md');
  });
});

describe('checkGitIgnore', () => {
  let dir: string;
  beforeEach(() => { dir = makeTmpDir(); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('passes when no .postlane/.gitignore exists', () => {
    const result = checkGitIgnore(dir);
    expect(result.passed).toBe(true);
  });

  it('passes when .gitignore does not list config.json', () => {
    mkdirSync(join(dir, '.postlane'), { recursive: true });
    writeFileSync(join(dir, '.postlane', '.gitignore'), 'config.local.json\n');
    const result = checkGitIgnore(dir);
    expect(result.passed).toBe(true);
  });

  it('fails when config.json is in .postlane/.gitignore', () => {
    mkdirSync(join(dir, '.postlane'), { recursive: true });
    writeFileSync(join(dir, '.postlane', '.gitignore'), 'config.json\n');
    const result = checkGitIgnore(dir);
    expect(result.passed).toBe(false);
    expect(result.fix).toMatch(/config\.local\.json/);
  });

  it('ignores comment lines in .gitignore', () => {
    mkdirSync(join(dir, '.postlane'), { recursive: true });
    writeFileSync(join(dir, '.postlane', '.gitignore'), '# config.json\nconfig.local.json\n');
    const result = checkGitIgnore(dir);
    expect(result.passed).toBe(true);
  });
});

describe('checkLocalConfigTracked', () => {
  let dir: string;
  beforeEach(() => { dir = makeTmpDir(); mkdirSync(join(dir, '.git'), { recursive: true }); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('passes when git ls-files returns empty (not tracked)', () => {
    // In a fresh tmp dir, config.local.json is not tracked
    const result = checkLocalConfigTracked(dir);
    expect(result.passed).toBe(true);
  });

  it('returns check name "local-config-untracked"', () => {
    const result = checkLocalConfigTracked(dir);
    expect(result.name).toBe('local-config-untracked');
  });
});

describe('checkRepoRegistered', () => {
  let dir: string;
  let tmpPostlaneDir: string;
  beforeEach(() => {
    dir = makeTmpDir();
    tmpPostlaneDir = makeTmpDir();
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    rmSync(tmpPostlaneDir, { recursive: true, force: true });
  });

  it('fails when no repos.json exists', () => {
    const reposPath = join(tmpPostlaneDir, 'repos.json');
    const result = checkRepoRegistered('/nonexistent/path/that/is/not/registered', reposPath);
    expect(result.passed).toBe(false);
    expect(result.fix).toContain('postlane register');
  });

  it('passes when current dir is in repos.json', () => {
    const reposPath = join(tmpPostlaneDir, 'repos.json');
    const repos = {
      version: 1,
      repos: [{ id: 'x', name: 'test', path: dir, active: true, added_at: new Date().toISOString() }],
    };
    writeFileSync(reposPath, JSON.stringify(repos, null, 2));
    const result = checkRepoRegistered(dir, reposPath);
    expect(result.passed).toBe(true);
  });

  it('fails when target dir is not in repos.json', () => {
    const reposPath = join(tmpPostlaneDir, 'repos.json');
    const repos = {
      version: 1,
      repos: [{ id: 'x', name: 'test', path: '/some/other/path', active: true, added_at: new Date().toISOString() }],
    };
    writeFileSync(reposPath, JSON.stringify(repos, null, 2));
    const result = checkRepoRegistered(dir, reposPath);
    expect(result.passed).toBe(false);
  });
});
