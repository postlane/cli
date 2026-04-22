#!/usr/bin/env node
// SPDX-License-Identifier: BUSL-1.1

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { registerCommand } from './commands/register.js';
import { doctorCommand } from './commands/doctor.js';

const program = new Command();

program
  .name('postlane')
  .description('Postlane CLI - Social media post scheduling')
  .version('0.0.1');

program
  .command('init')
  .description('Set up Postlane in the current repository')
  .option('--defaults', 'Use default values for all questions')
  .option('--no-attribution', 'Disable "Built with Postlane" attribution in posts')
  .action(initCommand);

program
  .command('register')
  .description('Register this repository with the Postlane app')
  .action(registerCommand);

program
  .command('doctor')
  .description('Run health checks for Postlane setup')
  .action(doctorCommand);

program.parse();
