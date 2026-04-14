// SPDX-License-Identifier: BUSL-1.1

import { mkdirSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import chalk from 'chalk';

interface InitOptions {
  defaults?: boolean;
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
    const gitDir = join(process.cwd(), '.git');
    if (!existsSync(gitDir)) {
      console.error(chalk.red(`Error: ${process.cwd()} is not a git repository.`));
      console.error(chalk.yellow('Run postlane init from inside a git repo.'));
      process.exit(1);
    }

    console.log(chalk.blue('Postlane setup started...'));
    console.log(chalk.gray('This will configure Postlane for this repository.\n'));

    // TODO: Implement interactive questions
    // TODO: Implement file writing
    // TODO: Implement partial init recovery

    console.log(chalk.green('\n✓ Setup complete!'));
    console.log(chalk.gray('Invoke /draft-post in your IDE to draft your first post.'));
  } catch (error) {
    console.error(chalk.red('Setup failed:'), error);
    process.exit(1);
  }
}
