// SPDX-License-Identifier: BUSL-1.1

import { mkdirSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { askSetupQuestions } from '../utils/questions.js';
import { writeConfigFiles, checkPartialInit, repairPartialInit } from '../utils/files.js';
import { registerCommand } from './register.js';

interface InitOptions {
  defaults?: boolean;
  noAttribution?: boolean;
}

export async function initCommand(options: InitOptions) {
  try {
    // Ensure ~/.postlane exists first
    const postlaneDir = join(homedir(), '.postlane');
    mkdirSync(postlaneDir, { recursive: true });

    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0], 10);

    if (majorVersion < 18) {
      console.error(chalk.red(`Error: Node.js >= 18 required. You are running ${nodeVersion}.`));
      console.error(chalk.yellow('Update Node.js: https://nodejs.org/'));
      process.exit(1);
    }

    // Validate git repository
    const targetDir = process.cwd();
    const gitDir = join(targetDir, '.git');
    if (!existsSync(gitDir)) {
      console.error(chalk.red(`Error: ${targetDir} is not a git repository.`));
      console.error(chalk.yellow('Run postlane init from inside a git repo.'));
      process.exit(1);
    }

    // Check for partial init
    const initStatus = checkPartialInit(targetDir);

    if (initStatus === 'complete') {
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'This repo already has a .postlane/config.json.',
          choices: [
            {
              name: 'Register with the Postlane app (recommended - keep existing config)',
              value: 'register',
            },
            {
              name: 'Re-run setup (overwrites existing config)',
              value: 'overwrite',
            },
          ],
          default: 'register',
        },
      ]);

      if (action === 'register') {
        console.log(chalk.blue('\nSkipping setup, proceeding to registration...'));
        await registerCommand();
        return;
      }
      // If overwrite, continue with setup
    }

    if (initStatus === 'partial') {
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'Setup appears incomplete.',
          choices: [
            {
              name: 'Complete setup (copy missing files)',
              value: 'complete',
            },
            {
              name: 'Start over (re-run full setup)',
              value: 'restart',
            },
          ],
          default: 'complete',
        },
      ]);

      if (action === 'complete') {
        console.log(chalk.blue('\nCompleting partial setup...'));
        repairPartialInit(targetDir);
        console.log(chalk.green('✓ Setup completed!'));
        console.log(chalk.gray('Invoke /draft-post in your IDE to draft your first post.'));
        console.log(chalk.gray(`API keys go in Postlane's Settings panel, not config.json.`));
        console.log(chalk.gray('postlane.dev/docs/credentials'));
        return;
      }
      // If restart, continue with setup
    }

    console.log(chalk.blue('Postlane setup started...'));
    console.log(chalk.gray('This will configure Postlane for this repository.\n'));

    // Ask setup questions
    const answers = await askSetupQuestions(options.defaults || false, options.noAttribution || false);

    // Write all config files
    writeConfigFiles(targetDir, answers);

    console.log(chalk.green('\n✓ Setup complete!'));

    // Step 9: Automatically call postlane register
    console.log(chalk.blue('\nRegistering with Postlane app...'));
    await registerCommand();

    console.log(chalk.gray('\nInvoke /draft-post in your IDE to draft your first post.'));
    console.log(chalk.gray(`API keys go in Postlane's Settings panel, not config.json.`));
    console.log(chalk.gray('postlane.dev/docs/credentials'));
    console.log(chalk.gray('\nRun `postlane setup-analytics` to enable conversion tracking on your site (requires v3).'));
  } catch (error) {
    console.error(chalk.red('Setup failed:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
