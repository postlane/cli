#!/usr/bin/env node
// SPDX-License-Identifier: BUSL-1.1

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { registerCommand } from './commands/register.js';
import { doctorCommand } from './commands/doctor.js';
import { syncSkillsCommand } from './commands/sync_skills.js';
import pkg from '../package.json' with { type: 'json' };

const { version } = pkg;

const program = new Command();

program
  .name('postlane')
  .description('Postlane CLI - Social media post scheduling')
  .version(version);

program
  .command('init')
  .description('Set up Postlane in the current repository or workspace')
  .option('--defaults', 'Use default values for all questions')
  .option('--no-attribution', 'Disable "Built with Postlane" attribution in posts')
  .option('--workspace [path]', 'Initialise as a workspace; optional path defaults to CWD')
  .action(initCommand);

program
  .command('register')
  .description('Register this repository with the Postlane app')
  .action(registerCommand);

program
  .command('doctor')
  .description('Run health checks for Postlane setup')
  .option('--json', 'Output results as JSON')
  .action(doctorCommand);

program
  .command('sync-skills')
  .description('Update Claude Code skill files from the latest prompts source')
  .option('--global', 'Install to ~/.claude/commands/ instead of the current repo')
  .action(syncSkillsCommand);

program.parse();
