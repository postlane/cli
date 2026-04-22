// SPDX-License-Identifier: BUSL-1.1
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

describe('Build process', () => {
  const promptsDir = join(__dirname, '../../prompts/commands');
  const bundledSkillsDir = join(__dirname, '../bundled-skills');

  beforeEach(() => {
    // Create mock prompts directory with skill files
    mkdirSync(promptsDir, { recursive: true });
    writeFileSync(join(promptsDir, 'draft-post.md'), '# Draft Post');
    writeFileSync(join(promptsDir, 'draft-post.prompt'), 'prompt content');
    writeFileSync(join(promptsDir, 'register-repo.md'), '# Register Repo');
    writeFileSync(join(promptsDir, 'register-repo.prompt'), 'prompt content');

    const templateDir = join(__dirname, '../../prompts');
    writeFileSync(join(templateDir, 'preview-template.html'), '<html></html>');
  });

  afterEach(() => {
    // Clean up
    if (existsSync(join(__dirname, '../../prompts'))) {
      rmSync(join(__dirname, '../../prompts'), { recursive: true, force: true });
    }
    if (existsSync(bundledSkillsDir)) {
      rmSync(bundledSkillsDir, { recursive: true, force: true });
    }
  });

  it('should copy skill files from prompts to bundled-skills during prebuild', () => {
    // Run prebuild (which runs before build)
    execSync('npm run prebuild', { cwd: join(__dirname, '..'), stdio: 'pipe' });

    // Verify files were copied into commands/ subdirectory
    const commandsDir = join(bundledSkillsDir, 'commands');
    expect(existsSync(join(commandsDir, 'draft-post.md'))).toBe(true);
    expect(existsSync(join(commandsDir, 'draft-post.prompt'))).toBe(true);
    expect(existsSync(join(commandsDir, 'register-repo.md'))).toBe(true);
    expect(existsSync(join(commandsDir, 'register-repo.prompt'))).toBe(true);
    expect(existsSync(join(bundledSkillsDir, 'preview-template.html'))).toBe(true);
  });

  it('should warn but not fail if prompts repo is not present', () => {
    // Remove prompts directory
    rmSync(join(__dirname, '../../prompts'), { recursive: true, force: true });

    // Prebuild should succeed with warning (needed for CI where prompts is not available)
    const result = execSync('npm run prebuild', {
      cwd: join(__dirname, '..'),
      encoding: 'utf-8',
    });

    // Should contain warning message
    expect(result).toContain('WARNING');
    expect(result).toContain('prompts repo not found');

    // bundled-skills should not be created if prompts is missing
    expect(existsSync(bundledSkillsDir)).toBe(false);
  });
});
