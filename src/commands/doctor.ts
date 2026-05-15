// SPDX-License-Identifier: BUSL-1.1

import { existsSync, readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { homedir } from 'os';
import { join } from 'path';
import chalk from 'chalk';

export function isValidPort(portStr: string): boolean {
  if (!/^\d{1,5}$/.test(portStr)) return false;
  const n = parseInt(portStr, 10);
  return n >= 1 && n <= 65535;
}

interface Check {
  name: string;
  description: string;
  passed: boolean;
  status?: 'skipped';
  fix?: string;
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

export async function runDoctor(): Promise<Check[]> {
  const checks: Check[] = [];
  const targetDir = process.cwd();

  // Check 1: Is .postlane/config.json present and valid JSON?
  const configPath = join(targetDir, '.postlane', 'config.json');
  let configValid = false;

  if (!existsSync(configPath)) {
    checks.push({
      name: 'config.json',
      description: 'Configuration file exists',
      passed: false,
      fix: 'Run `npx postlane init` to set up this repo.',
    });
  } else {
    try {
      const content = readFileSync(configPath, 'utf-8');
      JSON.parse(content);
      configValid = true;
      checks.push({
        name: 'config.json',
        description: 'Configuration file exists',
        passed: true,
      });
    } catch (error) {
      checks.push({
        name: 'config.json',
        description: 'Configuration file exists',
        passed: false,
        fix: 'Run `npx postlane init` to set up this repo.',
      });
    }
  }

  // Check 2: Is the Postlane app installed?
  const platform = process.platform;
  const paths = KNOWN_INSTALL_PATHS[platform] || [];
  const appInstalled = paths.some(path => existsSync(path));

  checks.push({
    name: 'app-installed',
    description: 'Postlane app installed',
    passed: appInstalled,
    fix: appInstalled ? undefined : 'Download Postlane at https://postlane.dev/download',
  });

  // Check 3: Is the Postlane app running?
  const postlaneDir = join(homedir(), '.postlane');
  const portPath = join(postlaneDir, 'port');
  let appRunning = false;

  if (existsSync(portPath)) {
    try {
      const portStr = readFileSync(portPath, 'utf-8').trim();
      if (isValidPort(portStr)) {
        const healthUrl = `http://127.0.0.1:${portStr}/health`;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 200);
          const response = await fetch(healthUrl, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (response.ok) appRunning = true;
        } catch {
          // Health check failed — app not running
        }
      }
    } catch {
      // Port file read failed
    }
  }

  checks.push({
    name: 'app-running',
    description: 'Postlane app running',
    passed: appRunning,
    fix: appRunning ? undefined : 'Open the Postlane app (or run: `open -a Postlane` on macOS)',
  });

  // Check 4: Is this repo registered with the app?
  const reposPath = join(postlaneDir, 'repos.json');
  let repoRegistered = false;

  if (existsSync(reposPath)) {
    try {
      const content = readFileSync(reposPath, 'utf-8');
      const repos = JSON.parse(content);

      if (repos.repos && Array.isArray(repos.repos)) {
        repoRegistered = repos.repos.some((r: any) => r.path === targetDir);
      }
    } catch (error) {
      // repos.json parse failed
    }
  }

  checks.push({
    name: 'repo-registered',
    description: 'Repository registered',
    passed: repoRegistered,
    fix: repoRegistered ? undefined : 'Run `postlane register` or `/register` in your IDE',
  });

  // Check 5: Is ~/.postlane/session.token readable?
  const tokenPath = join(postlaneDir, 'session.token');
  let tokenReadable = false;
  try {
    readFileSync(tokenPath, 'utf8');
    tokenReadable = true;
  } catch {
    tokenReadable = false;
  }

  checks.push({
    name: 'session-token',
    description: 'Session token exists',
    passed: tokenReadable,
    fix: tokenReadable ? undefined : 'Restart the Postlane app to regenerate the session token.',
  });

  // Check 6: Scheduler API connectivity (not yet implemented — skipped until v1.2)
  checks.push({
    name: 'scheduler-api',
    description: 'Scheduler API reachable',
    passed: false,
    status: 'skipped',
  });

  // Check 7: Are all expected skill files present in .claude/commands/?
  const EXPECTED_SKILL_FILES = [
    'draft-post.md',
    'draft-x.md',
    'draft-bluesky.md',
    'draft-mastodon.md',
    'draft-linkedin.md',
    'draft-substack.md',
    'draft-product-hunt.md',
    'draft-show-hn.md',
    'draft-changelog.md',
    'redraft-post.md',
  ];

  const claudeCommandsPath = join(targetDir, '.claude', 'commands');
  const missingSkillFiles = EXPECTED_SKILL_FILES.filter(
    (f) => !existsSync(join(claudeCommandsPath, f))
  );
  const skillFilesValid = missingSkillFiles.length === 0;

  checks.push({
    name: 'skill-files',
    description: 'Skill files present and current',
    passed: skillFilesValid,
    fix: skillFilesValid
      ? undefined
      : `Missing skill files: ${missingSkillFiles.join(', ')}. Run \`npx postlane init --update-skills\` to refresh. (Note: --update-skills is coming in v1.1)`,
  });

  // Check 8: Is config.json in .postlane/.gitignore? (v1 migration warning)
  const postlaneGitignorePath = join(targetDir, '.postlane', '.gitignore');
  let configInGitignore = false;
  if (existsSync(postlaneGitignorePath)) {
    const lines = readFileSync(postlaneGitignorePath, 'utf-8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    configInGitignore = lines.some((l) => l === 'config.json');
  }

  checks.push({
    name: 'config-in-gitignore',
    description: 'config.json not in .gitignore',
    passed: !configInGitignore,
    fix: configInGitignore
      ? 'Remove config.json from .gitignore and add config.local.json instead. Run `npx postlane init` to migrate.'
      : undefined,
  });

  // Check 9: Is config.local.json tracked by git? (should be git-ignored)
  let localConfigTracked = false;
  try {
    const output = execFileSync(
      'git',
      ['ls-files', '--cached', '--', '.postlane/config.local.json'],
      { cwd: targetDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    );
    localConfigTracked = output.trim().length > 0;
  } catch {
    localConfigTracked = false;
  }

  checks.push({
    name: 'local-config-untracked',
    description: 'config.local.json not tracked by git',
    passed: !localConfigTracked,
    fix: localConfigTracked
      ? 'Run `git rm --cached .postlane/config.local.json` and add it to .gitignore.'
      : undefined,
  });

  return checks;
}

export function getExitCode(checks: Check[]): number {
  return checks.every(c => c.passed || c.status === 'skipped') ? 0 : 1;
}

export async function doctorCommand() {
  console.log(chalk.blue('Running Postlane health checks...\n'));

  const checks = await runDoctor();

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
