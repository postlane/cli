#!/usr/bin/env node
// SPDX-License-Identifier: BUSL-1.1

import { Command } from 'commander';
import { initCommand } from './commands/init.js';

const program = new Command();

program
  .name('postlane')
  .description('Postlane CLI - Social media post scheduling')
  .version('0.0.1');

program
  .command('init')
  .description('Set up Postlane in the current repository')
  .option('--defaults', 'Use default values for all questions')
  .action(initCommand);

program.parse();
