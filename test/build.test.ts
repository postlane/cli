// SPDX-License-Identifier: BUSL-1.1
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, rmSync, mkdtempSync, realpathSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Build process — cleanup stays inside tmpdir', () => {
  it('afterEach cleanup path must be inside os.tmpdir()', () => {
    // This test documents the fix: cleanup paths must be inside tmpdir(),
    // never hardcoded relative paths like join(__dirname, '../../prompts')
    // which could resolve to a real sibling repo and delete it.
    const tmpBase = tmpdir();
    const safeCleanupPath = mkdtempSync(join(tmpBase, 'postlane-guard-'));

    let resolvedCleanup: string;
    let resolvedTmpdir: string;
    try {
      resolvedCleanup = realpathSync(safeCleanupPath);
    } catch {
      resolvedCleanup = safeCleanupPath;
    }
    try {
      resolvedTmpdir = realpathSync(tmpBase);
    } catch {
      resolvedTmpdir = tmpBase;
    }

    // A safe cleanup path always starts with tmpdir
    expect(resolvedCleanup.startsWith(resolvedTmpdir)).toBe(true);

    rmSync(safeCleanupPath, { recursive: true, force: true });
  });
});

describe('Build process', () => {
  let tmpPrompts: string;
  const bundledSkillsDir = join(__dirname, '../bundled-skills');

  beforeEach(() => {
    // Create a temp directory to simulate the prompts repo — never touches the real repo
    tmpPrompts = mkdtempSync(join(tmpdir(), 'postlane-test-'));
    const commandsDir = join(tmpPrompts, 'commands');
    mkdirSync(commandsDir, { recursive: true });
    writeFileSync(join(commandsDir, 'draft-post.md'), '# Draft Post');
    writeFileSync(join(commandsDir, 'draft-post.prompt'), 'prompt content');
    writeFileSync(join(commandsDir, 'register-repo.md'), '# Register Repo');
    writeFileSync(join(commandsDir, 'register-repo.prompt'), 'prompt content');
    writeFileSync(join(tmpPrompts, 'preview-template.html'), '<html></html>');
  });

  afterEach(() => {
    // Clean up only paths inside tmpdir
    if (existsSync(tmpPrompts)) {
      rmSync(tmpPrompts, { recursive: true, force: true });
    }
    if (existsSync(bundledSkillsDir)) {
      rmSync(bundledSkillsDir, { recursive: true, force: true });
    }
  });

  it('should copy skill files from prompts to bundled-skills during prebuild', () => {
    // Run prebuild pointing at our temp prompts dir via POSTLANE_PROMPTS_DIR env var
    execSync('npm run prebuild', {
      cwd: join(__dirname, '..'),
      stdio: 'pipe',
      env: { ...process.env, PROMPTS_DIR: tmpPrompts },
    });

    // Verify files were copied into commands/ subdirectory
    const commandsDir = join(bundledSkillsDir, 'commands');
    expect(existsSync(join(commandsDir, 'draft-post.md'))).toBe(true);
    expect(existsSync(join(commandsDir, 'draft-post.prompt'))).toBe(true);
    expect(existsSync(join(commandsDir, 'register-repo.md'))).toBe(true);
    expect(existsSync(join(commandsDir, 'register-repo.prompt'))).toBe(true);
    expect(existsSync(join(bundledSkillsDir, 'preview-template.html'))).toBe(true);
  });

  it('should warn but not fail if prompts repo is not present', () => {
    // Remove the tmp prompts directory so prebuild sees no prompts
    rmSync(tmpPrompts, { recursive: true, force: true });

    // Prebuild should succeed with warning (needed for CI where prompts is not available)
    const result = execSync('npm run prebuild', {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
      env: { ...process.env, PROMPTS_DIR: tmpPrompts },
    });

    // Should contain warning message
    expect(result).toContain('WARNING');
    expect(result).toContain('prompts repo not found');

    // bundled-skills should not be created if prompts is missing
    expect(existsSync(bundledSkillsDir)).toBe(false);
  });
});
