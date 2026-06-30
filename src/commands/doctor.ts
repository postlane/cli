// SPDX-License-Identifier: BUSL-1.1

import { existsSync, readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { homedir } from 'os';
import { join } from 'path';
import chalk from 'chalk';
import { isAppInstalled, isAppHealthy } from '../app/health.js';
import { isReposConfig } from '../app/repos.js';
import { SKILL_FILE_NAMES } from '../app/skill_manifest.js';

export interface Check {
  name: string;
  description: string;
  passed: boolean;
  status?: 'skipped';
  fix?: string;
}

export function checkConfig(targetDir: string): Check {
  const configPath = join(targetDir, '.postlane', 'config.json');
  if (!existsSync(configPath)) {
    return { name: 'config.json', description: 'Configuration file exists', passed: false, fix: 'Run `npx postlane init` to set up this repo.' };
  }
  try {
    const content = readFileSync(configPath, 'utf-8');
    JSON.parse(content);
    return { name: 'config.json', description: 'Configuration file exists', passed: true };
  } catch {
    return { name: 'config.json', description: 'Configuration file exists', passed: false, fix: 'Run `npx postlane init` to set up this repo.' };
  }
}

export function checkAppInstalled(): Check {
  const appInstalled = isAppInstalled();
  return {
    name: 'app-installed',
    description: 'Postlane app installed',
    passed: appInstalled,
    fix: appInstalled ? undefined : 'Download Postlane at https://postlane.dev/download',
  };
}

export async function checkAppRunning(): Promise<Check> {
  const portPath = join(homedir(), '.postlane', 'port');
  let appRunning = false;
  if (existsSync(portPath)) {
    try {
      const portStr = readFileSync(portPath, 'utf-8').trim();
      appRunning = await isAppHealthy(portStr);
    } catch {
      appRunning = false;
    }
  }
  return {
    name: 'app-running',
    description: 'Postlane app running',
    passed: appRunning,
    fix: appRunning ? undefined : 'Open the Postlane app (or run: `open -a Postlane` on macOS)',
  };
}

export function checkRepoRegistered(
  targetDir: string,
  reposPath: string = join(homedir(), '.postlane', 'repos.json'),
): Check {
  let repoRegistered = false;
  if (existsSync(reposPath)) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(reposPath, 'utf-8'));
      if (isReposConfig(parsed)) {
        repoRegistered = parsed.repos.some((r) => r.path === targetDir);
      }
    } catch {
      repoRegistered = false;
    }
  }
  return {
    name: 'repo-registered',
    description: 'Repository registered',
    passed: repoRegistered,
    fix: repoRegistered ? undefined : 'Run `postlane register` or `/register` in your IDE',
  };
}

export function checkSessionToken(): Check {
  const tokenPath = join(homedir(), '.postlane', 'session.token');
  let tokenReadable = false;
  try {
    readFileSync(tokenPath, 'utf8');
    tokenReadable = true;
  } catch {
    tokenReadable = false;
  }
  return {
    name: 'session-token',
    description: 'Session token exists',
    passed: tokenReadable,
    fix: tokenReadable ? undefined : 'Restart the Postlane app to regenerate the session token.',
  };
}

export function checkSkillFiles(targetDir: string): Check {
  const claudeCommandsPath = join(targetDir, '.claude', 'commands');
  const missing = SKILL_FILE_NAMES.filter(f => !existsSync(join(claudeCommandsPath, f)));
  const passed = missing.length === 0;
  return {
    name: 'skill-files',
    description: 'Skill files present and current',
    passed,
    fix: passed
      ? undefined
      : `Missing skill files: ${missing.join(', ')}. Run \`npx postlane sync-skills\` to refresh.`,
  };
}

export function checkGitIgnore(targetDir: string): Check {
  const gitignorePath = join(targetDir, '.postlane', '.gitignore');
  let configInGitignore = false;
  if (existsSync(gitignorePath)) {
    const lines = readFileSync(gitignorePath, 'utf-8')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'));
    configInGitignore = lines.some(l => l === 'config.json');
  }
  return {
    name: 'config-in-gitignore',
    description: 'config.json not in .gitignore',
    passed: !configInGitignore,
    fix: configInGitignore
      ? 'Remove config.json from .gitignore and add config.local.json instead. Run `npx postlane init` to migrate.'
      : undefined,
  };
}

export function checkLocalConfigTracked(targetDir: string): Check {
  let localConfigTracked = false;
  try {
    const output = execFileSync(
      'git',
      ['ls-files', '--cached', '--', '.postlane/config.local.json'],
      { cwd: targetDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    );
    localConfigTracked = output.trim().length > 0;
  } catch {
    // git not available or not a git repo — treat as untracked (safe default)
    localConfigTracked = false;
  }
  return {
    name: 'local-config-untracked',
    description: 'config.local.json not tracked by git',
    passed: !localConfigTracked,
    fix: localConfigTracked
      ? 'Run `git rm --cached .postlane/config.local.json` and add it to .gitignore.'
      : undefined,
  };
}

export async function runDoctor(): Promise<Check[]> {
  const targetDir = process.cwd();

  const checks: Check[] = [
    checkConfig(targetDir),
    checkAppInstalled(),
    await checkAppRunning(),
    checkRepoRegistered(targetDir),
    checkSessionToken(),
    { name: 'scheduler-api', description: 'Scheduler API reachable', passed: false, status: 'skipped' },
    checkSkillFiles(targetDir),
    checkGitIgnore(targetDir),
    checkLocalConfigTracked(targetDir),
  ];

  return checks;
}

export function getExitCode(checks: Check[]): number {
  return checks.every(c => c.passed || c.status === 'skipped') ? 0 : 1;
}

export function formatDoctorJson(checks: Check[]): string {
  const nonSkipped = checks.filter((c) => c.status !== 'skipped');
  const allPassed = nonSkipped.length === 0 ? null : nonSkipped.every((c) => c.passed);
  return JSON.stringify({
    schema_version: 1,
    all_passed: allPassed,
    checks_ran: nonSkipped.length,
    checks: checks.map((c) => {
      const entry: Record<string, unknown> = {
        name: c.name,
        description: c.description,
        passed: c.passed,
      };
      if (c.status) entry.status = c.status;
      if (c.fix) entry.fix = c.fix;
      return entry;
    }),
  }, null, 2);
}

export async function doctorCommand(options: { json?: boolean } = {}) {
  if (!options.json) {
    console.log(chalk.blue('Running Postlane health checks...\n'));
  }

  const checks = await runDoctor();

  if (options.json) {
    console.log(formatDoctorJson(checks));
    process.exit(getExitCode(checks));
    return;
  }

  for (const check of checks) {
    if (check.status === 'skipped') {
      console.log(chalk.gray('–'), check.description, chalk.gray('(skipped)'));
    } else if (check.passed) {
      console.log(chalk.green('✓'), check.description);
    } else {
      console.log(chalk.red('✗'), check.description);
      if (check.fix) {
        console.log(chalk.gray(`  Fix: ${check.fix}`));
      }
    }
  }

  const exitCode = getExitCode(checks);

  console.log();
  if (exitCode === 0) {
    console.log(chalk.green('All checks passed! ✓'));
  } else {
    console.log(chalk.yellow('Some checks failed. See fixes above.'));
  }

  process.exit(exitCode);
}
