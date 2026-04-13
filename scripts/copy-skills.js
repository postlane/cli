#!/usr/bin/env node
// SPDX-License-Identifier: BUSL-1.1

const { existsSync, mkdirSync, copyFileSync } = require('fs');
const { join, dirname } = require('path');

const PROMPTS_DIR = join(__dirname, '../../prompts');
const BUNDLED_SKILLS_DIR = join(__dirname, '../bundled-skills');

// Check if prompts repo exists
if (!existsSync(PROMPTS_DIR)) {
  console.error('ERROR: prompts repo not found at', PROMPTS_DIR);
  console.error('The postlane/prompts repository must be cloned as a sibling directory.');
  console.error('Expected layout:');
  console.error('  parent-dir/');
  console.error('    cli/');
  console.error('    prompts/  <- required');
  console.error('');
  console.error('See DEVELOPMENT.md for setup instructions.');
  process.exit(1);
}

// Create bundled-skills directory
mkdirSync(BUNDLED_SKILLS_DIR, { recursive: true });

// Files to copy
const skillFiles = [
  { src: join(PROMPTS_DIR, 'commands/draft-post.md'), dest: 'draft-post.md' },
  { src: join(PROMPTS_DIR, 'commands/draft-post.prompt'), dest: 'draft-post.prompt' },
  { src: join(PROMPTS_DIR, 'commands/register-repo.md'), dest: 'register-repo.md' },
  { src: join(PROMPTS_DIR, 'commands/register-repo.prompt'), dest: 'register-repo.prompt' },
  { src: join(PROMPTS_DIR, 'preview-template.html'), dest: 'preview-template.html' },
];

// Copy files
let copiedCount = 0;
for (const { src, dest } of skillFiles) {
  const destPath = join(BUNDLED_SKILLS_DIR, dest);

  if (existsSync(src)) {
    copyFileSync(src, destPath);
    copiedCount++;
  } else {
    console.warn('Warning: Skill file not found, skipping:', src);
  }
}

console.log(`Copied ${copiedCount}/${skillFiles.length} skill files to bundled-skills/`);

if (copiedCount === 0) {
  console.error('ERROR: No skill files were copied. The prompts repo may be incomplete.');
  process.exit(1);
}
