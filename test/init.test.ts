// SPDX-License-Identifier: BUSL-1.1
// Tests for §7.6.1 (v1.1 skill file copies) and §7.4.5 (attribution prompt)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { writeConfigFiles, validatePlatforms } from '../src/utils/files.js';

// All 9 v1.1 commands (§7.6.1 requires 18 files = 9 × 2)
const V1_1_COMMANDS = [
  'draft-changelog',
  'draft-show-hn',
  'draft-product-hunt',
  'redraft-post',
  'draft-x',
  'draft-bluesky',
  'draft-mastodon',
  'draft-linkedin',
  'draft-substack',
];

const BASE_COMMANDS = [
  'draft-post',
  'register-repo',
];

const ALL_COMMANDS = [...BASE_COMMANDS, ...V1_1_COMMANDS];

const MINIMAL_ANSWERS = {
  baseUrl: 'https://example.com',
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

function makeTmpRepo(): string {
  const dir = join(tmpdir(), `postlane-init-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, '.git'), { recursive: true });
  return dir;
}

function makeBundledSkills(cliDir: string): void {
  const bundledDir = join(cliDir, 'bundled-skills');
  const commandsDir = join(bundledDir, 'commands');
  const runnerDir = join(bundledDir, 'runner');
  mkdirSync(commandsDir, { recursive: true });
  mkdirSync(runnerDir, { recursive: true });
  for (const cmd of ALL_COMMANDS) {
    writeFileSync(join(commandsDir, `${cmd}.md`), `# ${cmd}`);
    writeFileSync(join(commandsDir, `${cmd}.prompt`), `prompt for ${cmd}`);
  }
  writeFileSync(join(bundledDir, 'preview-template.html'), '<html></html>');
  writeFileSync(join(runnerDir, 'run.ts'), 'export {}');
}

// ---------------------------------------------------------------------------
// §7.6.1 — all 18 v1.1 skill files are copied on init
// ---------------------------------------------------------------------------

describe('writeConfigFiles — v1.1 skill files', () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = makeTmpRepo();
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('copies all 11 .md skill files to .claude/commands/', () => {
    writeConfigFiles(repoDir, MINIMAL_ANSWERS);

    const claudeCommandsDir = join(repoDir, '.claude', 'commands');

    for (const cmd of ALL_COMMANDS) {
      expect(
        existsSync(join(claudeCommandsDir, `${cmd}.md`)),
        `${cmd}.md should exist in .claude/commands/`,
      ).toBe(true);
    }
  });

  it('copies all 11 .prompt files to .postlane/commands/', () => {
    writeConfigFiles(repoDir, MINIMAL_ANSWERS);

    const postlaneCommandsDir = join(repoDir, '.postlane', 'commands');

    for (const cmd of ALL_COMMANDS) {
      expect(
        existsSync(join(postlaneCommandsDir, `${cmd}.prompt`)),
        `${cmd}.prompt should exist in .postlane/commands/`,
      ).toBe(true);
    }
  });

  it('copies all nine v1.1 command .md files', () => {
    writeConfigFiles(repoDir, MINIMAL_ANSWERS);

    const claudeCommandsDir = join(repoDir, '.claude', 'commands');

    for (const cmd of V1_1_COMMANDS) {
      expect(
        existsSync(join(claudeCommandsDir, `${cmd}.md`)),
        `${cmd}.md (v1.1) should exist`,
      ).toBe(true);
    }
  });

  it('copies all nine v1.1 command .prompt files', () => {
    writeConfigFiles(repoDir, MINIMAL_ANSWERS);

    const postlaneCommandsDir = join(repoDir, '.postlane', 'commands');

    for (const cmd of V1_1_COMMANDS) {
      expect(
        existsSync(join(postlaneCommandsDir, `${cmd}.prompt`)),
        `${cmd}.prompt (v1.1) should exist`,
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// --no-attribution flag: writes attribution: false to config.json
// ---------------------------------------------------------------------------

describe('--no-attribution flag', () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = makeTmpRepo();
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('writes attribution: false when --no-attribution is passed with --defaults', async () => {
    const { askSetupQuestions } = await import('../src/utils/questions.js');
    // useDefaults=true, noAttribution=true
    const answers = await askSetupQuestions(true, true);
    writeConfigFiles(repoDir, answers);
    const config = JSON.parse(readFileSync(join(repoDir, '.postlane', 'config.json'), 'utf8'));
    expect(config.attribution).toBe(false);
  });

  it('does not write attribution key when --defaults is passed without --no-attribution', async () => {
    const { askSetupQuestions } = await import('../src/utils/questions.js');
    // useDefaults=true, noAttribution=false (default)
    const answers = await askSetupQuestions(true, false);
    writeConfigFiles(repoDir, answers);
    const config = JSON.parse(readFileSync(join(repoDir, '.postlane', 'config.json'), 'utf8'));
    expect(config.attribution).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// §7.6.2 — forward reference printed after setup
// The message is output from initCommand() — tested at integration level in cli.test.ts
// Here we verify the string is referenced in the source
// ---------------------------------------------------------------------------

describe('postlane init — forward reference', () => {
  it('init.ts references setup-analytics forward reference text', async () => {
    const { readFileSync } = await import('fs');
    const { fileURLToPath } = await import('url');
    const { dirname, join } = await import('path');
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const initSrc = readFileSync(join(__dirname, '../src/commands/init.ts'), 'utf8');
    expect(initSrc).toMatch(/setup-analytics/);
  });
});

// ---------------------------------------------------------------------------
// §7.4.5 — attribution prompt: writes attribution: false when user opts out
// ---------------------------------------------------------------------------

describe('writeConfigFiles — attribution field', () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = makeTmpRepo();
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('does not write attribution key when attribution is true (absence = enabled)', () => {
    writeConfigFiles(repoDir, { ...MINIMAL_ANSWERS, attribution: true });
    const config = JSON.parse(readFileSync(join(repoDir, '.postlane', 'config.json'), 'utf8'));
    expect(config.attribution).toBeUndefined();
  });

  it('writes attribution: false when user opts out', () => {
    writeConfigFiles(repoDir, { ...MINIMAL_ANSWERS, attribution: false });
    const config = JSON.parse(readFileSync(join(repoDir, '.postlane', 'config.json'), 'utf8'));
    expect(config.attribution).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Fix 4 — platform validation: rejects unsupported platforms
// ---------------------------------------------------------------------------

describe('platform validation', () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = makeTmpRepo();
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('validatePlatforms returns empty array for valid platforms', () => {
    expect(validatePlatforms(['x', 'bluesky', 'mastodon'])).toEqual([]);
  });

  it('validatePlatforms accepts substack_notes', () => {
    expect(validatePlatforms(['substack_notes'])).toEqual([]);
  });

  it('validatePlatforms accepts show_hn', () => {
    expect(validatePlatforms(['show_hn'])).toEqual([]);
  });

  it('validatePlatforms accepts changelog', () => {
    expect(validatePlatforms(['changelog'])).toEqual([]);
  });

  it('validatePlatforms accepts product_hunt (snake_case, matching desktop)', () => {
    expect(validatePlatforms(['product_hunt'])).toEqual([]);
  });

  it('validatePlatforms returns invalid platforms', () => {
    const invalid = validatePlatforms(['x', 'tiktok', 'instagram']);
    expect(invalid).toContain('tiktok');
    expect(invalid).toContain('instagram');
    expect(invalid).not.toContain('x');
  });

  it('writeConfigFiles throws when an unsupported platform is provided', () => {
    expect(() => {
      writeConfigFiles(repoDir, { ...MINIMAL_ANSWERS, platforms: ['x', 'tiktok'] });
    }).toThrow(/Unsupported platform/);
  });

  it('writeConfigFiles throws with the name of the invalid platform', () => {
    expect(() => {
      writeConfigFiles(repoDir, { ...MINIMAL_ANSWERS, platforms: ['instagram'] });
    }).toThrow('instagram');
  });
});

// ---------------------------------------------------------------------------
// 9.3.3 — mastodon_instance written to config.json when mastodon is in platforms
// ---------------------------------------------------------------------------

describe('writeConfigFiles — mastodon_instance', () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = makeTmpRepo();
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('writes mastodon_instance when mastodon is in platforms and mastodonInstance is provided', () => {
    writeConfigFiles(repoDir, {
      ...MINIMAL_ANSWERS,
      platforms: ['x', 'mastodon'],
      mastodonInstance: 'mastodon.social',
    });
    const config = JSON.parse(readFileSync(join(repoDir, '.postlane', 'config.json'), 'utf8'));
    expect(config.mastodon_instance).toBe('mastodon.social');
  });

  it('does not write mastodon_instance when mastodon is not in platforms', () => {
    writeConfigFiles(repoDir, {
      ...MINIMAL_ANSWERS,
      platforms: ['x', 'bluesky'],
      mastodonInstance: 'mastodon.social',
    });
    const config = JSON.parse(readFileSync(join(repoDir, '.postlane', 'config.json'), 'utf8'));
    expect(config.mastodon_instance).toBeUndefined();
  });

  it('does not write mastodon_instance when mastodonInstance is not provided', () => {
    writeConfigFiles(repoDir, {
      ...MINIMAL_ANSWERS,
      platforms: ['x', 'mastodon'],
    });
    const config = JSON.parse(readFileSync(join(repoDir, '.postlane', 'config.json'), 'utf8'));
    expect(config.mastodon_instance).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Item 13 — 'register' action on already-complete repo calls registerCommand
// ---------------------------------------------------------------------------

describe('initCommand — complete repo re-init with register action', () => {
  it('calls registerCommand automatically instead of printing manual instruction', async () => {
    const { vi } = await import('vitest');
    vi.resetModules();

    let registerCalled = false;
    vi.doMock('../src/commands/register.js', () => ({
      registerCommand: async () => { registerCalled = true; },
    }));
    vi.doMock('inquirer', () => ({
      default: { prompt: async () => ({ action: 'register' }) },
    }));

    const tmpDir = join(tmpdir(), `postlane-init13-${Date.now()}`);
    mkdirSync(join(tmpDir, '.git'), { recursive: true });
    mkdirSync(join(tmpDir, '.postlane'), { recursive: true });
    mkdirSync(join(tmpDir, '.claude', 'commands'), { recursive: true });
    writeFileSync(join(tmpDir, '.postlane', 'config.json'), '{}');
    writeFileSync(join(tmpDir, '.claude', 'commands', 'draft-post.md'), '');
    writeFileSync(join(tmpDir, '.claude', 'commands', 'register-repo.md'), '');

    const origCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      const { initCommand } = await import('../src/commands/init.js');
      await initCommand({});
      expect(registerCalled).toBe(true);
    } finally {
      process.chdir(origCwd);
      rmSync(tmpDir, { recursive: true, force: true });
      vi.doUnmock('../src/commands/register.js');
      vi.doUnmock('inquirer');
      vi.resetModules();
    }
  });
});

// ---------------------------------------------------------------------------
// Issue 4 — init.ts must reject a .git that is a symlink
// ---------------------------------------------------------------------------

describe('initCommand — symlink .git rejection', () => {
  it('rejects a directory where .git is a symlink', async () => {
    const { vi } = await import('vitest');
    vi.resetModules();

    const tmpDir = join(tmpdir(), `postlane-symlink-init-${Date.now()}`);
    const realGit = join(tmpdir(), `postlane-real-git-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    mkdirSync(realGit, { recursive: true });

    const { symlinkSync } = await import('fs');
    symlinkSync(realGit, join(tmpDir, '.git'));

    const origCwd = process.cwd();
    process.chdir(tmpDir);

    const errorMessages: string[] = [];
    const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errorMessages.push(args.map(String).join(' '));
    });
    let exitCalledWith: number | undefined;
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      exitCalledWith = code as number;
      throw new Error('exit');
    });

    try {
      const { initCommand } = await import('../src/commands/init.js');
      await initCommand({});
    } catch {
      // swallow process.exit throw
    }

    errorSpy.mockRestore();
    exitSpy.mockRestore();
    process.chdir(origCwd);
    rmSync(tmpDir, { recursive: true, force: true });
    rmSync(realGit, { recursive: true, force: true });
    vi.resetModules();

    // Must reject before writing any files
    expect(exitCalledWith).toBe(1);
    expect(errorMessages.join('\n')).toMatch(/not a git repository/i);
  });
});

// ---------------------------------------------------------------------------
// Issue 2 — askSetupQuestions includes mastodonInstance in --defaults mode
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Item 21 — profileId removed from SetupAnswers (dead code path)
// ---------------------------------------------------------------------------

describe('writeConfigFiles — no profile_id written (field removed)', () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = join(tmpdir(), `postlane-item21-${Date.now()}`);
    mkdirSync(repoDir, { recursive: true });
    mkdirSync(join(repoDir, '.git'), { recursive: true });
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('does not write profile_id to config.json', () => {
    writeConfigFiles(repoDir, MINIMAL_ANSWERS);
    const config = JSON.parse(readFileSync(join(repoDir, '.postlane', 'config.json'), 'utf8'));
    expect(config.scheduler?.profile_id).toBeUndefined();
  });

  it('SetupAnswers type has no profileId field', async () => {
    const { askSetupQuestions } = await import('../src/utils/questions.js');
    const answers = await askSetupQuestions(true);
    expect(Object.keys(answers)).not.toContain('profileId');
  });
});

describe('askSetupQuestions — mastodon instance (useDefaults)', () => {
  it('returns mastodonInstance when default platforms include mastodon', async () => {
    const { askSetupQuestions } = await import('../src/utils/questions.js');
    const answers = await askSetupQuestions(true);
    expect(answers.platforms).toContain('mastodon');
    expect(answers.mastodonInstance).toBe('mastodon.social');
  });
});

// ---------------------------------------------------------------------------
// 20.8.1 — initCommand accepts a non-git parent directory (workspace root)
// ---------------------------------------------------------------------------

describe('initCommand — workspace root (20.8.1)', () => {
  it('accepts a non-git parent directory that contains child git repos', async () => {
    const { vi } = await import('vitest');
    vi.resetModules();

    vi.doMock('../src/commands/register.js', () => ({
      registerCommand: async () => {},
    }));
    vi.doMock('../src/utils/questions.js', () => ({
      askSetupQuestions: async () => MINIMAL_ANSWERS,
    }));

    const wsDir = join(tmpdir(), `postlane-ws-init-${Date.now()}`);
    mkdirSync(join(wsDir, 'repo-a', '.git'), { recursive: true });
    mkdirSync(join(wsDir, 'repo-b', '.git'), { recursive: true });

    const origCwd = process.cwd();
    process.chdir(wsDir);

    const errorMessages: string[] = [];
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errorMessages.push(args.map(String).join(' '));
    });
    let exitCode: number | undefined;
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      exitCode = code as number;
      throw new Error('exit');
    });

    try {
      const { initCommand } = await import('../src/commands/init.js');
      await initCommand({ defaults: true });
    } catch {
      // swallow process.exit throw
    }

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
    process.chdir(origCwd);
    vi.doUnmock('../src/commands/register.js');
    vi.doUnmock('../src/utils/questions.js');
    vi.resetModules();
    rmSync(wsDir, { recursive: true, force: true });

    expect(exitCode).not.toBe(1);
    expect(errorMessages.join('\n')).not.toMatch(/not a git repository/i);
  });

  it('rejects a directory with no .git/ and no child git repos', async () => {
    const { vi } = await import('vitest');
    vi.resetModules();

    const emptyDir = join(tmpdir(), `postlane-empty-init-${Date.now()}`);
    mkdirSync(emptyDir, { recursive: true });

    const origCwd = process.cwd();
    process.chdir(emptyDir);

    const errorMessages: string[] = [];
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errorMessages.push(args.map(String).join(' '));
    });
    let exitCode: number | undefined;
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      exitCode = code as number;
      throw new Error('exit');
    });

    try {
      const { initCommand } = await import('../src/commands/init.js');
      await initCommand({});
    } catch {
      // swallow process.exit throw
    }

    consoleSpy.mockRestore();
    exitSpy.mockRestore();
    process.chdir(origCwd);
    rmSync(emptyDir, { recursive: true, force: true });
    vi.resetModules();

    expect(exitCode).toBe(1);
    expect(errorMessages.join('\n')).toMatch(/not a git repository/i);
  });
});

// ---------------------------------------------------------------------------
// 20.9.12 — config.json / config.local.json split
// ---------------------------------------------------------------------------

describe('writeConfigFiles — config.local.json split (20.9)', () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = makeTmpRepo();
  });

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('writes scheduler.provider to config.local.json, not config.json', () => {
    writeConfigFiles(repoDir, { ...MINIMAL_ANSWERS, schedulerProvider: 'zernio' });
    const config = JSON.parse(readFileSync(join(repoDir, '.postlane', 'config.json'), 'utf8'));
    const local = JSON.parse(readFileSync(join(repoDir, '.postlane', 'config.local.json'), 'utf8'));
    expect(config.scheduler?.provider).toBeUndefined();
    expect(local.scheduler.provider).toBe('zernio');
  });

  it('adds config.local.json to .gitignore but not config.json', () => {
    writeConfigFiles(repoDir, MINIMAL_ANSWERS);
    const gitignore = readFileSync(join(repoDir, '.postlane', '.gitignore'), 'utf8');
    expect(gitignore).toContain('config.local.json');
    expect(gitignore).not.toMatch(/\bconfig\.json\b/);
  });

  it('config.json does not contain a scheduler.provider field', () => {
    writeConfigFiles(repoDir, MINIMAL_ANSWERS);
    const config = JSON.parse(readFileSync(join(repoDir, '.postlane', 'config.json'), 'utf8'));
    expect(config.scheduler).toBeUndefined();
  });
});
