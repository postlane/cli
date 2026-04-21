// SPDX-License-Identifier: BUSL-1.1

import { mkdirSync, writeFileSync, existsSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { SetupAnswers } from './questions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface ConfigJson {
  version: number;
  base_url: string;
  platforms: string[];
  llm: {
    provider: string;
    model: string;
  };
  scheduler: {
    provider: string;
    profile_id?: string;
  };
  repo_type: string;
  style: string;
  utm_campaign: string;
  author: string;
}

export function writeConfigFiles(targetDir: string, answers: SetupAnswers): void {
  const postlaneDir = join(targetDir, '.postlane');

  // Step 1: Create .postlane directory
  mkdirSync(postlaneDir, { recursive: true });

  // Step 2: Write config.json
  const config: ConfigJson & { attribution?: boolean } = {
    version: 1,
    base_url: answers.baseUrl,
    platforms: answers.platforms,
    llm: {
      provider: answers.llmProvider,
      model: answers.llmModel,
    },
    scheduler: {
      provider: answers.schedulerProvider,
      ...(answers.profileId && { profile_id: answers.profileId }),
    },
    repo_type: answers.repoType,
    style: answers.style,
    utm_campaign: answers.utmCampaign,
    author: answers.author,
    // Only write attribution: false when user explicitly opts out.
    // Absence of the key means enabled (default).
    ...(answers.attribution === false && { attribution: false }),
  };

  writeFileSync(
    join(postlaneDir, 'config.json'),
    JSON.stringify(config, null, 2),
    'utf-8'
  );

  // Step 3: Write .gitignore
  const gitignoreContent = `# Postlane
runner/node_modules/
runner/dist/
posts/**/original.json
`;

  writeFileSync(
    join(postlaneDir, '.gitignore'),
    gitignoreContent,
    'utf-8'
  );

  // Steps 4-8: Copy bundled skill files.
  // .claude/commands/ — Claude Code slash commands (read by Claude Code on launch)
  // .postlane/commands/ — Continue .prompt files and other IDE formats
  // .postlane/prompts/ — preview template
  // .postlane/runner/ — standalone runner
  const claudeCommandsDir = join(targetDir, '.claude', 'commands');
  const postlaneCommandsDir = join(postlaneDir, 'commands');
  const promptsDir = join(postlaneDir, 'prompts');
  const runnerDir = join(postlaneDir, 'runner');

  mkdirSync(claudeCommandsDir, { recursive: true });
  mkdirSync(postlaneCommandsDir, { recursive: true });
  mkdirSync(promptsDir, { recursive: true });
  mkdirSync(runnerDir, { recursive: true });

  // Get the directory where the CLI is installed
  const cliDir = join(__dirname, '..', '..');
  const bundledSkillsDir = join(cliDir, 'bundled-skills');

  // All skill commands — base v1 + v1.1
  const allCommands = [
    'draft-post',
    'register-repo',
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

  // Copy skill files if they exist in bundled-skills
  const filesToCopy: Array<{ from: string; to: string }> = [
    ...allCommands.flatMap((cmd) => [
      { from: `${cmd}.md`, to: join(claudeCommandsDir, `${cmd}.md`) },
      { from: `${cmd}.prompt`, to: join(postlaneCommandsDir, `${cmd}.prompt`) },
    ]),
    { from: 'preview-template.html', to: join(promptsDir, 'preview-template.html') },
    { from: 'run.ts', to: join(runnerDir, 'run.ts') },
  ];

  for (const { from, to } of filesToCopy) {
    const sourcePath = join(bundledSkillsDir, from);
    if (existsSync(sourcePath)) {
      copyFileSync(sourcePath, to);
    } else {
      // Create placeholder files for now
      writeFileSync(to, `<!-- Placeholder for ${from} -->\n`, 'utf-8');
    }
  }
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

  const repairCommands = [
    'draft-post',
    'register-repo',
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

  const repairFiles: Array<{ from: string; to: string }> = [
    ...repairCommands.flatMap((cmd) => [
      { from: `${cmd}.md`, to: join(claudeCommandsDir, `${cmd}.md`) },
      { from: `${cmd}.prompt`, to: join(postlaneCommandsDir, `${cmd}.prompt`) },
    ]),
    { from: 'preview-template.html', to: join(promptsDir, 'preview-template.html') },
    { from: 'run.ts', to: join(runnerDir, 'run.ts') },
  ];

  for (const { from, to } of repairFiles) {
    const sourcePath = join(bundledSkillsDir, from);
    if (existsSync(sourcePath) && !existsSync(to)) {
      copyFileSync(sourcePath, to);
    } else if (!existsSync(to)) {
      writeFileSync(to, `<!-- Placeholder for ${from} -->\n`, 'utf-8');
    }
  }
}
