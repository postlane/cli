// SPDX-License-Identifier: BUSL-1.1

import { existsSync, readFileSync, writeFileSync, lstatSync } from 'fs';
import { homedir } from 'os';
import { join, basename } from 'path';
import chalk from 'chalk';
import { randomUUID } from 'crypto';

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

const KNOWN_INSTALL_PATHS: Record<string, string[]> = {
  darwin: [
    '/Applications/Postlane.app',
    join(homedir(), 'Applications/Postlane.app'),
  ],
  linux: [
    '/usr/bin/postlane',
    '/usr/local/bin/postlane',
    join(homedir(), '.local/bin/postlane'),
  ],
  win32: [
    join(process.env.LOCALAPPDATA || '', 'Programs\\Postlane\\Postlane.exe'),
    join(process.env.PROGRAMFILES || '', 'Postlane\\Postlane.exe'),
  ],
};

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

function isValidPort(value: string): boolean {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 65535;
}

async function detectAppState(): Promise<AppState> {
  const postlaneDir = join(homedir(), '.postlane');
  const portPath = join(postlaneDir, 'port');

  // Step 1: Try to connect to running instance
  if (existsSync(portPath)) {
    const port = readFileSync(portPath, 'utf-8').trim();
    if (!isValidPort(port)) {
      console.warn(`[postlane] port file contains invalid port value '${port}' — skipping health check`);
    } else {
      try {
        const healthUrl = `http://127.0.0.1:${port}/health`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 200);

        const response = await fetch(healthUrl, {
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          return 'running';
        }
      } catch (error) {
        // Health check failed - app not running
      }
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
      const result = await response.json() as { success: boolean; name: string };
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
      config = JSON.parse(content);
    } catch (error) {
      console.warn(chalk.yellow('Warning: Could not read repos.json, creating new file'));
      config = { version: 1, repos: [] };
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
