// SPDX-License-Identifier: BUSL-1.1

import { mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync } from 'fs';
import { join, dirname, isAbsolute } from 'path';
import { fileURLToPath } from 'url';
import type { SetupAnswers } from '../init/questions.js';
import { resolveSkillsSource } from './skills_source.js';
import { SKILL_FILE_NAMES } from '../app/skill_manifest.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const SUPPORTED_PLATFORMS = ['x', 'bluesky', 'mastodon', 'linkedin', 'substack_notes', 'substack', 'product_hunt', 'show_hn', 'changelog'] as const;

export function validatePlatforms(platforms: string[]): string[] {
  const invalid = platforms.filter(
    (p) => !(SUPPORTED_PLATFORMS as readonly string[]).includes(p)
  );
  return invalid;
}

// Derive command names from the shared manifest (strip .md suffix).
const ALL_SKILL_COMMANDS = SKILL_FILE_NAMES.map((f) => f.replace(/\.md$/, ''));

export interface ConfigJson {
  version: number;
  mastodon_instance?: string;
  llm: {
    provider: string;
    model: string;
  };
  repo_type: string;
  style: string;
  utm_campaign: string;
  author: string;
}

export interface ConfigLocalJson {
  scheduler: {
    provider: string;
  };
}

export function writeConfigFiles(targetDir: string, answers: SetupAnswers): void {
  const config: ConfigJson & { attribution?: boolean } = {
    version: 1,
    ...(answers.mastodonInstance ? { mastodon_instance: answers.mastodonInstance } : {}),
    llm: { provider: answers.llmProvider, model: answers.llmModel },
    repo_type: answers.repoType,
    style: answers.style,
    utm_campaign: answers.utmCampaign,
    author: answers.author,
    // Only write attribution: false when user explicitly opts out.
    // Absence of the key means enabled (default).
    ...(answers.attribution === false && { attribution: false }),
  };
  const localConfig: ConfigLocalJson = { scheduler: { provider: answers.schedulerProvider } };
  writePostlaneScaffolding(targetDir, config, localConfig);
}

/// Writes config files for a GitHub App repo without interactive prompts.
/// Uses sensible defaults and stores the server-provided `projectId`.
/// Skill files and .gitignore are written identically to the regular flow.
export function writeGitHubConfigFiles(
  targetDir: string,
  projectId: string,
  projectName: string,
): void {
  const config = {
    version: 1,
    project_id: projectId,
    llm: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
    repo_type: 'open-source-library',
    style: 'Direct, technically precise.',
    utm_campaign: '',
    author: projectName,
  };
  const localConfig: ConfigLocalJson = { scheduler: { provider: 'zernio' } };
  writePostlaneScaffolding(targetDir, config, localConfig);
}

function writePostlaneScaffolding<T extends object>(
  targetDir: string,
  config: T,
  localConfig: ConfigLocalJson,
): void {
  if (!isAbsolute(targetDir)) {
    throw new Error(`targetDir must be an absolute path, got: ${targetDir}`);
  }
  const postlaneDir = join(targetDir, '.postlane');
  mkdirSync(postlaneDir, { recursive: true });
  writeFileSync(join(postlaneDir, 'config.json'), JSON.stringify(config, null, 2), 'utf-8');
  writeFileSync(join(postlaneDir, 'config.local.json'), JSON.stringify(localConfig, null, 2), { encoding: 'utf-8', mode: 0o600 });
  writePostlaneGitignore(postlaneDir);
  copySkillFiles(targetDir, postlaneDir);
}

function writePostlaneGitignore(postlaneDir: string): void {
  writeFileSync(
    join(postlaneDir, '.gitignore'),
    '# Postlane\nrunner/node_modules/\nrunner/dist/\nposts/**/original.json\nconfig.local.json\n',
    'utf-8',
  );
}

function copySkillFiles(targetDir: string, postlaneDir: string): void {
  const cliDir = join(__dirname, '..', '..');
  const { commandsDir: sourceCommandsDir } = resolveSkillsSource(cliDir);
  copySkillManifest(targetDir, postlaneDir, sourceCommandsDir);
}

function copySkillManifest(
  targetDir: string,
  postlaneDir: string,
  sourceDir: string,
  opts?: { skipExisting?: boolean },
): void {
  const claudeCommandsDir = join(targetDir, '.claude', 'commands');
  const postlaneCommandsDir = join(postlaneDir, 'commands');
  const promptsDir = join(postlaneDir, 'prompts');
  const runnerDir = join(postlaneDir, 'runner');

  mkdirSync(claudeCommandsDir, { recursive: true });
  mkdirSync(postlaneCommandsDir, { recursive: true });
  mkdirSync(promptsDir, { recursive: true });
  mkdirSync(runnerDir, { recursive: true });

  const cliDir = join(__dirname, '..', '..');
  const bundledSkillsDir = join(cliDir, 'bundled-skills');
  const bundledRunnerDir = join(bundledSkillsDir, 'runner');

  const filesToCopy: Array<{ from: string; to: string }> = [
    ...ALL_SKILL_COMMANDS.flatMap((cmd) => [
      { from: join(sourceDir, `${cmd}.md`), to: join(claudeCommandsDir, `${cmd}.md`) },
      { from: join(sourceDir, `${cmd}.prompt`), to: join(postlaneCommandsDir, `${cmd}.prompt`) },
    ]),
    { from: join(bundledSkillsDir, 'preview-template.html'), to: join(promptsDir, 'preview-template.html') },
    { from: join(bundledRunnerDir, 'run.ts'), to: join(runnerDir, 'run.ts') },
  ];

  const skipExisting = opts?.skipExisting ?? false;
  for (const { from, to } of filesToCopy) {
    if (skipExisting && existsSync(to)) continue;
    if (existsSync(from)) {
      copyFileSync(from, to);
    } else {
      writeFileSync(to, `<!-- Placeholder for ${from} -->\n`, 'utf-8');
    }
  }
}

/// Patches `project_id` into an existing `.postlane/config.json` without touching other fields.
export function patchProjectId(targetDir: string, projectId: string): void {
  if (!isAbsolute(targetDir)) {
    throw new Error(`targetDir must be an absolute path, got: ${targetDir}`);
  }
  const configPath = join(targetDir, '.postlane', 'config.json');
  const content = readFileSync(configPath, 'utf-8');
  const config: Record<string, unknown> = JSON.parse(content);
  config['project_id'] = projectId;
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

export function checkPartialInit(targetDir: string): 'complete' | 'partial' | 'none' {
  const postlaneDir = join(targetDir, '.postlane');
  const configPath = join(postlaneDir, 'config.json');
  const claudeCommandsDir = join(targetDir, '.claude', 'commands');

  if (!existsSync(configPath)) {
    if (existsSync(join(postlaneDir, '.gitignore'))) {
      return 'partial';
    }
    return 'none';
  }

  // config.json exists — check if Claude Code slash commands are installed
  const requiredFiles = [
    join(claudeCommandsDir, 'draft-post.md'),
    join(claudeCommandsDir, 'register-repo.md'),
  ];

  const allFilesExist = requiredFiles.every(existsSync);

  return allFilesExist ? 'complete' : 'partial';
}

export function repairPartialInit(targetDir: string): void {
  const postlaneDir = join(targetDir, '.postlane');
  const cliDir = join(__dirname, '..', '..');
  const bundledCommandsDir = join(cliDir, 'bundled-skills', 'commands');
  copySkillManifest(targetDir, postlaneDir, bundledCommandsDir, { skipExisting: true });
}
