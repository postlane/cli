// SPDX-License-Identifier: BUSL-1.1

import { mkdirSync, lstatSync, readdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { askSetupQuestions } from '../init/questions.js';
import { writeConfigFiles, writeGitHubConfigFiles, patchProjectId, checkPartialInit, repairPartialInit } from '../init/config_writer.js';
import { detectGitProvider, extractOrgLogin } from '../git/provider.js';
import { fetchGitHubProjectConfig, readAppSessionInfo } from '../git/github_session.js';
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

    // Validate git repository or workspace root — reject symlinks to prevent path traversal
    const targetDir = process.cwd();
    const gitDir = join(targetDir, '.git');
    let gitStat: ReturnType<typeof lstatSync> | null = null;
    try {
      gitStat = lstatSync(gitDir);
    } catch {
      gitStat = null;
    }
    if (gitStat && !gitStat.isDirectory()) {
      // .git exists but is a symlink or file — reject
      console.error(chalk.red(`Error: ${targetDir} is not a git repository.`));
      console.error(chalk.yellow('Run postlane init from inside a git repo or workspace root.'));
      process.exit(1);
    }
    if (!gitStat) {
      // No .git — accept only if immediate children contain git repos (workspace root)
      const hasChildRepos = readdirSync(targetDir, { withFileTypes: true })
        .filter(e => e.isDirectory() && !e.isSymbolicLink())
        .some(e => {
          try { return lstatSync(join(targetDir, e.name, '.git')).isDirectory(); } catch { return false; }
        });
      if (!hasChildRepos) {
        console.error(chalk.red(`Error: ${targetDir} is not a git repository.`));
        console.error(chalk.yellow('Run postlane init from inside a git repo or a workspace root containing child repos.'));
        process.exit(1);
      }
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

    const provider = detectGitProvider(targetDir);

    if (provider === 'github') {
      const session = readAppSessionInfo();
      if (!session) {
        console.error(chalk.red('Sign in to Postlane first.'));
        console.error(chalk.yellow('Open the Postlane desktop app, sign in, then run `postlane init` again.'));
        process.exit(1);
      }
      const orgLogin = extractOrgLogin(targetDir);
      const config = orgLogin
        ? await fetchGitHubProjectConfig(orgLogin, session.port, session.token)
        : null;
      if (!config) {
        console.error(chalk.red('Could not find this repository in your Postlane workspace.'));
        console.error(chalk.yellow('Open the Postlane desktop app, connect this repo to a project, then run `postlane init` again.'));
        process.exit(1);
      }
      writeGitHubConfigFiles(targetDir, config.project_id, config.project_name);
      console.log(chalk.green('\n✓ Setup complete!'));
      console.log(chalk.blue('\nRegistering with Postlane app...'));
      await registerCommand();
      console.log(chalk.gray('\nInvoke /draft-post in your IDE to draft your first post.'));
      console.log(chalk.gray('postlane.dev/docs/credentials'));
      return;
    }

    // Interactive flow for GitLab and self-hosted providers
    const answers = await askSetupQuestions(options.defaults || false, options.noAttribution || false);
    writeConfigFiles(targetDir, answers);

    // Stamp project_id from the running desktop app when available.
    const session = readAppSessionInfo();
    if (session) {
      const orgLogin = extractOrgLogin(targetDir);
      if (orgLogin) {
        const projectConfig = await fetchGitHubProjectConfig(orgLogin, session.port, session.token);
        if (projectConfig) {
          patchProjectId(targetDir, projectConfig.project_id);
          console.log(chalk.green(`✓ Linked to workspace: ${projectConfig.project_name}`));
        }
      }
    }

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
