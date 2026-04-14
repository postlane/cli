// SPDX-License-Identifier: BUSL-1.1

import { mkdirSync, writeFileSync, existsSync, copyFileSync } from 'fs';
import { join } from 'path';
import type { SetupAnswers } from './questions.js';

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
  const config: ConfigJson = {
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

  // Steps 4-8: Copy bundled skill files
  const commandsDir = join(postlaneDir, 'commands');
  const promptsDir = join(postlaneDir, 'prompts');
  const runnerDir = join(postlaneDir, 'runner');

  mkdirSync(commandsDir, { recursive: true });
  mkdirSync(promptsDir, { recursive: true });
  mkdirSync(runnerDir, { recursive: true });

  // Get the directory where the CLI is installed
  const cliDir = join(__dirname, '..', '..');
  const bundledSkillsDir = join(cliDir, 'bundled-skills');

  // Copy skill files if they exist in bundled-skills
  const filesToCopy = [
    { from: 'draft-post.md', to: join(commandsDir, 'draft-post.md') },
    { from: 'draft-post.prompt', to: join(commandsDir, 'draft-post.prompt') },
    { from: 'register-repo.md', to: join(commandsDir, 'register-repo.md') },
    { from: 'register-repo.prompt', to: join(commandsDir, 'register-repo.prompt') },
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
  const commandsDir = join(postlaneDir, 'commands');

  if (!existsSync(configPath)) {
    // Check if .gitignore exists (very early failure)
    if (existsSync(join(postlaneDir, '.gitignore'))) {
      return 'partial';
    }
    return 'none';
  }

  // config.json exists - check if skill files are present
  const requiredFiles = [
    join(commandsDir, 'draft-post.md'),
    join(commandsDir, 'draft-post.prompt'),
  ];

  const allFilesExist = requiredFiles.every(existsSync);

  return allFilesExist ? 'complete' : 'partial';
}

export function repairPartialInit(targetDir: string): void {
  const postlaneDir = join(targetDir, '.postlane');
  const commandsDir = join(postlaneDir, 'commands');
  const promptsDir = join(postlaneDir, 'prompts');
  const runnerDir = join(postlaneDir, 'runner');

  mkdirSync(commandsDir, { recursive: true });
  mkdirSync(promptsDir, { recursive: true });
  mkdirSync(runnerDir, { recursive: true });

  // Re-copy all skill files
  const cliDir = join(__dirname, '..', '..');
  const bundledSkillsDir = join(cliDir, 'bundled-skills');

  const filesToCopy = [
    { from: 'draft-post.md', to: join(commandsDir, 'draft-post.md') },
    { from: 'draft-post.prompt', to: join(commandsDir, 'draft-post.prompt') },
    { from: 'register-repo.md', to: join(commandsDir, 'register-repo.md') },
    { from: 'register-repo.prompt', to: join(commandsDir, 'register-repo.prompt') },
    { from: 'preview-template.html', to: join(promptsDir, 'preview-template.html') },
    { from: 'run.ts', to: join(runnerDir, 'run.ts') },
  ];

  for (const { from, to } of filesToCopy) {
    const sourcePath = join(bundledSkillsDir, from);
    if (existsSync(sourcePath) && !existsSync(to)) {
      copyFileSync(sourcePath, to);
    } else if (!existsSync(to)) {
      writeFileSync(to, `<!-- Placeholder for ${from} -->\n`, 'utf-8');
    }
  }
}
