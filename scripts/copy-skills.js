#!/usr/bin/env node
// SPDX-License-Identifier: BUSL-1.1

import { existsSync, mkdirSync, copyFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROMPTS_DIR = process.env.PROMPTS_DIR || join(__dirname, '../../prompts');
const BUNDLED_SKILLS_DIR = join(__dirname, '../bundled-skills');

// Check if prompts repo exists
if (!existsSync(PROMPTS_DIR)) {
  console.log('WARNING: prompts repo not found at', PROMPTS_DIR);
  console.log('Skill files will not be bundled. This is OK in CI or during early development.');
  console.log('For local builds, see DEVELOPMENT.md for setup instructions.');
  console.log('Skipping skill file copy.');
  process.exit(0);
}

// Create bundled-skills directory structure
const bundledCommandsDir = join(BUNDLED_SKILLS_DIR, 'commands');
const bundledRunnerDir = join(BUNDLED_SKILLS_DIR, 'runner');

mkdirSync(bundledCommandsDir, { recursive: true });
mkdirSync(bundledRunnerDir, { recursive: true });

let copiedCount = 0;

// Copy all files from commands/
const commandsDir = join(PROMPTS_DIR, 'commands');
if (existsSync(commandsDir)) {
  const commandFiles = readdirSync(commandsDir);
  for (const file of commandFiles) {
    const src = join(commandsDir, file);
    const dest = join(bundledCommandsDir, file);
    copyFileSync(src, dest);
    copiedCount++;
  }
} else {
  console.warn('Warning: commands/ directory not found in prompts repo:', commandsDir);
}

// Copy runner/run.ts if it exists
const runnerSrc = join(PROMPTS_DIR, 'runner', 'run.ts');
if (existsSync(runnerSrc)) {
  copyFileSync(runnerSrc, join(bundledRunnerDir, 'run.ts'));
  copiedCount++;
} else {
  console.warn('Warning: runner/run.ts not found, skipping:', runnerSrc);
}

// Copy preview-template.html if it exists
const templateSrc = join(PROMPTS_DIR, 'preview-template.html');
if (existsSync(templateSrc)) {
  copyFileSync(templateSrc, join(BUNDLED_SKILLS_DIR, 'preview-template.html'));
  copiedCount++;
} else {
  console.warn('Warning: preview-template.html not found, skipping:', templateSrc);
}

console.log(`Copied ${copiedCount} files to bundled-skills/`);

if (copiedCount === 0) {
  console.log('WARNING: No skill files were copied. The prompts repo may be incomplete or empty.');
  console.log('This is expected during early development. Skill files will be added in later milestones.');
}
