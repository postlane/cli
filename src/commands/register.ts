// SPDX-License-Identifier: BUSL-1.1

import { existsSync, readFileSync, writeFileSync, lstatSync } from 'fs';
import { homedir } from 'os';
import { join, basename } from 'path';
import chalk from 'chalk';
import { randomUUID } from 'crypto';
import { isValidPort, KNOWN_INSTALL_PATHS, isAppHealthy } from '../app/health.js';

export function writeSecureJson(filePath: string, data: unknown): void {
  writeFileSync(filePath, JSON.stringify(data, null, 2), { encoding: 'utf-8', mode: 0o600 });
}

type AppState = 'running' | 'installed' | 'not-installed';

interface Repo {
  id: string;
  name: string;
  path: string;
  active: boolean;
  added_at: string;
}

interface ReposConfig {
  version: number;
  repos: Repo[];
}


export async function registerCommand() {
  try {
    const targetPath = process.cwd();

    // Validate git repository — reject symlinks to prevent path traversal
    const gitDir = join(targetPath, '.git');
    const gitStat = existsSync(gitDir) ? lstatSync(gitDir) : null;
    if (!gitStat || !gitStat.isDirectory()) {
      console.error(chalk.red(`Error: ${targetPath} is not a git repository.`));
      console.error(chalk.yellow('Run postlane register from inside a git repo.'));
      process.exit(1);
    }

    // Detect app state
    const state = await detectAppState();
    const repoName = basename(targetPath);

    switch (state) {
      case 'running':
        await handleRunningState(targetPath, repoName);
        break;
      case 'installed':
        handleInstalledState(targetPath, repoName);
        break;
      case 'not-installed':
        handleNotInstalledState(repoName);
        break;
    }
  } catch (error) {
    console.error(chalk.red('Registration failed:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

interface RegisterResponse {
  success: boolean;
  name: string;
}

function isRegisterResponse(val: unknown): val is RegisterResponse {
  return (
    typeof val === 'object' &&
    val !== null &&
    typeof (val as Record<string, unknown>).success === 'boolean' &&
    typeof (val as Record<string, unknown>).name === 'string'
  );
}

function isReposConfig(val: unknown): val is ReposConfig {
  if (typeof val !== 'object' || val === null) return false;
  const obj = val as Record<string, unknown>;
  if (typeof obj.version !== 'number' || !Array.isArray(obj.repos)) return false;
  return (obj.repos as unknown[]).every(
    (r) =>
      typeof r === 'object' &&
      r !== null &&
      typeof (r as Record<string, unknown>).id === 'string' &&
      typeof (r as Record<string, unknown>).name === 'string' &&
      typeof (r as Record<string, unknown>).path === 'string' &&
      typeof (r as Record<string, unknown>).active === 'boolean' &&
      typeof (r as Record<string, unknown>).added_at === 'string',
  );
}

async function detectAppState(): Promise<AppState> {
  const postlaneDir = join(homedir(), '.postlane');
  const portPath = join(postlaneDir, 'port');

  // Step 1: Try to connect to running instance
  if (existsSync(portPath)) {
    const port = readFileSync(portPath, 'utf-8').trim();
    if (!isValidPort(port)) {
      console.warn(`[postlane] port file contains invalid port value '${port}' — skipping health check`);
    } else if (await isAppHealthy(port)) {
      return 'running';
    }
  }

  // Step 2: Check known install paths
  const platform = process.platform;
  const paths = KNOWN_INSTALL_PATHS[platform] || [];

  for (const path of paths) {
    if (existsSync(path)) {
      return 'installed';
    }
  }

  // Step 3: Not installed
  return 'not-installed';
}

async function handleRunningState(repoPath: string, repoName: string): Promise<void> {
  const postlaneDir = join(homedir(), '.postlane');
  const tokenPath = join(postlaneDir, 'session.token');
  const portPath = join(postlaneDir, 'port');

  if (!existsSync(tokenPath)) {
    console.error(chalk.red('Error: session.token not found.'));
    console.error(chalk.yellow('Restart the Postlane app to regenerate the session token.'));
    process.exit(1);
  }

  const token = readFileSync(tokenPath, 'utf-8').trim();
  const port = readFileSync(portPath, 'utf-8').trim();

  const registerUrl = `http://127.0.0.1:${port}/register`;

  try {
    const response = await fetch(registerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ path: repoPath }),
    });

    if (response.ok) {
      const raw: unknown = await response.json();
      const result = isRegisterResponse(raw) ? raw : { success: true, name: repoName };
      console.log(chalk.green(`✓ ${result.name} registered with Postlane.`));
      console.log(chalk.gray('The app is now watching this repo.'));
    } else {
      const errorText = await response.text();
      console.error(chalk.red('Registration failed:'), errorText);
      process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red('Failed to connect to Postlane app:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function handleInstalledState(repoPath: string, repoName: string): void {
  const postlaneDir = join(homedir(), '.postlane');
  const reposPath = join(postlaneDir, 'repos.json');

  // Read existing repos or create empty config
  let config: ReposConfig;
  if (existsSync(reposPath)) {
    try {
      const content = readFileSync(reposPath, 'utf-8');
      const parsed: unknown = JSON.parse(content);
      if (!isReposConfig(parsed)) {
        throw new Error(
          `repos.json at ${reposPath} has an invalid schema: expected { version: 1, repos: [...] }. ` +
          'Delete the file and run `postlane register` again to recreate it.',
        );
      }
      config = parsed;
    } catch (error) {
      if (error instanceof SyntaxError) {
        console.warn(chalk.yellow(`Warning: repos.json at ${reposPath} is not valid JSON. Creating new file.`));
        config = { version: 1, repos: [] };
      } else {
        throw error;
      }
    }
  } else {
    config = { version: 1, repos: [] };
  }

  // Check if repo already registered
  const existing = config.repos.find(r => r.path === repoPath);
  if (existing) {
    console.log(chalk.yellow(`${repoName} is already registered.`));
    console.log(chalk.gray('Open the app to start watching: postlane://open'));
    return;
  }

  // Add new repo
  const newRepo: Repo = {
    id: randomUUID(),
    name: repoName,
    path: repoPath,
    active: true,
    added_at: new Date().toISOString(),
  };

  config.repos.push(newRepo);

  writeSecureJson(reposPath, config);

  console.log(chalk.green(`✓ ${repoName} saved to Postlane.`));
  console.log(chalk.gray('  Open the app to start watching: postlane://open'));
}

function handleNotInstalledState(repoName: string): void {
  console.log(chalk.green(`✓ ${repoName} is ready for Postlane.\n`));
  console.log('  Download the Postlane desktop app to watch this repo and approve posts:');
  console.log(chalk.cyan('  → https://postlane.dev/download\n'));
  console.log('  Already downloaded? Open the app, then run', chalk.bold('postlane register'), 'again.');
}
