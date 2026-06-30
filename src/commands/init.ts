// SPDX-License-Identifier: BUSL-1.1

import { mkdirSync, lstatSync, readdirSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join, resolve } from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { askSetupQuestions } from '../init/questions.js';
import { writeConfigFiles, writeGitHubConfigFiles, patchProjectId, checkPartialInit, repairPartialInit } from '../init/config_writer.js';
import { detectGitProvider, extractOrgLogin } from '../git/provider.js';
import { fetchGitHubProjectConfig, readAppSessionInfo } from '../git/github_session.js';
import { registerCommand } from './register.js';
import { workspaceInitCommand } from './workspace_init.js';

/// Prints the post-setup "next steps" hints. Shared across all init completion paths.
function printSetupHints(opts?: { includeSettingsHint?: boolean; includeAnalyticsHint?: boolean }): void {
  console.log(chalk.gray('\nInvoke /draft-post in your IDE to draft your first post.'));
  if (opts?.includeSettingsHint) {
    console.log(chalk.gray(`API keys go in Postlane's Settings panel, not config.json.`));
  }
  console.log(chalk.gray('postlane.dev/docs/credentials'));
  if (opts?.includeAnalyticsHint) {
    console.log(chalk.gray('\nConversion tracking coming soon. See postlane.dev/docs/analytics.'));
  }
}

interface InitOptions {
  defaults?: boolean;
  noAttribution?: boolean;
  workspace?: string | boolean;
  /** Override the ~/.postlane directory (used in tests to isolate from the real session). */
  postlaneDir?: string;
}

/// Checks Node.js version and validates the target directory is a git repo or workspace root.
/// Calls process.exit(1) on failure.
export function validateEnvironment(targetDir: string): void {
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0], 10);
  if (majorVersion < 18) {
    console.error(chalk.red(`Error: Node.js >= 18 required. You are running ${nodeVersion}.`));
    console.error(chalk.yellow('Update Node.js: https://nodejs.org/'));
    process.exit(1);
  }

  const gitDir = join(targetDir, '.git');
  let gitStat: ReturnType<typeof lstatSync> | null = null;
  try {
    gitStat = lstatSync(gitDir);
  } catch {
    gitStat = null;
  }
  if (gitStat && !gitStat.isDirectory()) {
    console.error(chalk.red(`Error: ${targetDir} is not a git repository.`));
    console.error(chalk.yellow('Run postlane init from inside a git repo or workspace root.'));
    process.exit(1);
  }
  if (!gitStat) {
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
}

/// Handles the case where init has already been run (complete or partial).
/// Returns 'done' if the flow is complete, 'continue' to proceed with full setup, or null if fresh.
export async function handleExistingConfig(
  targetDir: string,
  initStatus: 'complete' | 'partial' | 'none',
): Promise<'done' | 'continue' | null> {
  if (initStatus === 'none') return null;

  if (initStatus === 'complete') {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'This repo already has a .postlane/config.json.',
        choices: [
          { name: 'Register with the Postlane app (recommended - keep existing config)', value: 'register' },
          { name: 'Re-run setup (overwrites existing config)', value: 'overwrite' },
        ],
        default: 'register',
      },
    ]);
    if (action === 'register') {
      console.log(chalk.blue('\nSkipping setup, proceeding to registration...'));
      await registerCommand();
      return 'done';
    }
    return 'continue';
  }

  // partial
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'Setup appears incomplete.',
      choices: [
        { name: 'Complete setup (copy missing files)', value: 'complete' },
        { name: 'Start over (re-run full setup)', value: 'restart' },
      ],
      default: 'complete',
    },
  ]);
  if (action === 'complete') {
    console.log(chalk.blue('\nCompleting partial setup...'));
    repairPartialInit(targetDir);
    console.log(chalk.green('✓ Setup completed!'));
    printSetupHints({ includeSettingsHint: true });
    return 'done';
  }
  return 'continue';
}

/// Runs the GitHub-specific setup path: fetches project config from the desktop app and writes config files.
/// Calls process.exit(1) when the app is not running or the project is not found.
export async function setupGitHubFlow(targetDir: string): Promise<void> {
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
  printSetupHints();
}

/// Runs the interactive setup flow for GitLab and other non-GitHub providers.
export async function setupInteractiveFlow(
  targetDir: string,
  useDefaults: boolean,
  noAttribution: boolean,
  provider?: string,
): Promise<void> {
  const answers = await askSetupQuestions(useDefaults, noAttribution);
  writeConfigFiles(targetDir, answers);

  // Stamp project_id from the running desktop app when available (GitHub only).
  if (provider === 'github') {
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
  }

  console.log(chalk.green('\n✓ Setup complete!'));
  console.log(chalk.blue('\nRegistering with Postlane app...'));
  await registerCommand();
  printSetupHints({ includeSettingsHint: true, includeAnalyticsHint: true });
}

export async function initCommand(options: InitOptions) {
  try {
    const postlaneDir = options.postlaneDir ?? join(homedir(), '.postlane');
    mkdirSync(postlaneDir, { recursive: true });

    // 22.4.2: --workspace [path] flag forces workspace init mode.
    if (options.workspace !== undefined) {
      const wsPath = typeof options.workspace === 'string'
        ? resolve(options.workspace)
        : process.cwd();
      await workspaceInitCommand(wsPath, postlaneDir);
      return;
    }

    const targetDir = process.cwd();

    // 22.4.1: auto-detect workspace root (no .git, has child git repos).
    if (!existsSync(join(targetDir, '.git'))) {
      await workspaceInitCommand(targetDir, postlaneDir);
      return;
    }

    validateEnvironment(targetDir);

    const initStatus = checkPartialInit(targetDir);
    const existingResult = await handleExistingConfig(targetDir, initStatus);
    if (existingResult === 'done') return;

    console.log(chalk.blue('Postlane setup started...'));
    console.log(chalk.gray('This will configure Postlane for this repository.\n'));

    const provider = detectGitProvider(targetDir);
    if (provider === 'github') {
      await setupGitHubFlow(targetDir);
      return;
    }

    await setupInteractiveFlow(targetDir, options.defaults ?? false, options.noAttribution ?? false, provider);
  } catch (error) {
    console.error(chalk.red('Setup failed:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
