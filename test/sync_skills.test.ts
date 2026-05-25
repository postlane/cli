// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir, homedir } from 'os';
import { resolveSkillsSource } from '../src/init/skills_source.js';

function makeTmp(): string {
  const dir = join(tmpdir(), `pl-sync-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeSkillFile(dir: string, name: string, content = `<!-- postlane-version: 1.0.0 -->\n# ${name}`): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), content, 'utf-8');
}

// ── resolveSkillsSource ───────────────────────────────────────────────────────

describe('resolveSkillsSource', () => {
  let tmp: string;
  beforeEach(() => { tmp = makeTmp(); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('returns live source when prompts sibling exists', () => {
    const cliDir = join(tmp, 'cli');
    const liveCommandsDir = join(tmp, 'prompts', 'commands');
    mkdirSync(liveCommandsDir, { recursive: true });
    writeSkillFile(liveCommandsDir, 'draft-post.md', '<!-- postlane-version: 1.3.0 -->');

    const result = resolveSkillsSource(cliDir);

    expect(result.origin).toBe('live');
    expect(result.commandsDir).toBe(liveCommandsDir);
  });

  it('returns bundled source when prompts sibling is absent', () => {
    const cliDir = join(tmp, 'cli');
    const bundledCommandsDir = join(cliDir, 'bundled-skills', 'commands');
    mkdirSync(bundledCommandsDir, { recursive: true });
    writeSkillFile(bundledCommandsDir, 'draft-post.md');

    const result = resolveSkillsSource(cliDir);

    expect(result.origin).toBe('bundled');
    expect(result.commandsDir).toBe(bundledCommandsDir);
  });

  it('prefers live over bundled when both exist', () => {
    const cliDir = join(tmp, 'cli');
    const liveCommandsDir = join(tmp, 'prompts', 'commands');
    const bundledCommandsDir = join(cliDir, 'bundled-skills', 'commands');
    mkdirSync(liveCommandsDir, { recursive: true });
    mkdirSync(bundledCommandsDir, { recursive: true });
    writeSkillFile(liveCommandsDir, 'draft-post.md', '<!-- postlane-version: 1.3.0 -->');
    writeSkillFile(bundledCommandsDir, 'draft-post.md', '<!-- postlane-version: 1.0.0 -->');

    const result = resolveSkillsSource(cliDir);

    expect(result.origin).toBe('live');
  });

  it('returns bundled source when prompts/commands dir is absent even if prompts root exists', () => {
    const cliDir = join(tmp, 'cli');
    mkdirSync(join(tmp, 'prompts'), { recursive: true }); // prompts root exists but no commands/
    const bundledCommandsDir = join(cliDir, 'bundled-skills', 'commands');
    mkdirSync(bundledCommandsDir, { recursive: true });
    writeSkillFile(bundledCommandsDir, 'draft-post.md');

    const result = resolveSkillsSource(cliDir);

    expect(result.origin).toBe('bundled');
  });
});

// ── syncSkillFiles (the core copy logic, imported separately) ─────────────────

import { syncSkillFiles } from '../src/init/skills_source.js';

describe('syncSkillFiles', () => {
  let tmp: string;
  beforeEach(() => { tmp = makeTmp(); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('copies md files from source to target', () => {
    const sourceDir = join(tmp, 'source');
    const targetDir = join(tmp, 'target');
    writeSkillFile(sourceDir, 'draft-post.md', '<!-- postlane-version: 1.3.0 -->');
    writeSkillFile(sourceDir, 'draft-x.md', '<!-- postlane-version: 1.0.0 -->');
    mkdirSync(targetDir, { recursive: true });

    const count = syncSkillFiles(sourceDir, targetDir);

    expect(count).toBe(2);
    expect(existsSync(join(targetDir, 'draft-post.md'))).toBe(true);
    expect(readFileSync(join(targetDir, 'draft-post.md'), 'utf-8')).toContain('1.3.0');
    expect(existsSync(join(targetDir, 'draft-x.md'))).toBe(true);
  });

  it('overwrites stale files with latest source', () => {
    const sourceDir = join(tmp, 'source');
    const targetDir = join(tmp, 'target');
    writeSkillFile(sourceDir, 'draft-post.md', '<!-- postlane-version: 1.3.0 -->');
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(join(targetDir, 'draft-post.md'), '<!-- postlane-version: 1.0.0 -->', 'utf-8');

    syncSkillFiles(sourceDir, targetDir);

    expect(readFileSync(join(targetDir, 'draft-post.md'), 'utf-8')).toContain('1.3.0');
  });

  it('skips non-md files', () => {
    const sourceDir = join(tmp, 'source');
    const targetDir = join(tmp, 'target');
    writeSkillFile(sourceDir, 'draft-post.md');
    writeFileSync(join(sourceDir, 'draft-post.prompt'), 'some prompt', 'utf-8');
    mkdirSync(targetDir, { recursive: true });

    syncSkillFiles(sourceDir, targetDir);

    expect(existsSync(join(targetDir, 'draft-post.prompt'))).toBe(false);
  });

  it('creates target directory if absent', () => {
    const sourceDir = join(tmp, 'source');
    const targetDir = join(tmp, 'nested', 'target');
    writeSkillFile(sourceDir, 'draft-post.md');

    syncSkillFiles(sourceDir, targetDir);

    expect(existsSync(join(targetDir, 'draft-post.md'))).toBe(true);
  });

  it('returns 0 when source dir is empty', () => {
    const sourceDir = join(tmp, 'source');
    const targetDir = join(tmp, 'target');
    mkdirSync(sourceDir, { recursive: true });
    mkdirSync(targetDir, { recursive: true });

    const count = syncSkillFiles(sourceDir, targetDir);

    expect(count).toBe(0);
  });
});
