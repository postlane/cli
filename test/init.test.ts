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
