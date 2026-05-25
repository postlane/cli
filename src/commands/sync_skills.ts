// SPDX-License-Identifier: BUSL-1.1

import chalk from 'chalk';
import { join } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { resolveSkillsSource, syncSkillFiles } from '../init/skills_source.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI_DIR = join(__dirname, '..', '..');

export interface SyncSkillsOptions {
  global?: boolean;
}

export async function syncSkillsCommand(options: SyncSkillsOptions): Promise<void> {
  const source = resolveSkillsSource(CLI_DIR);
  const targetDir = options.global
    ? join(homedir(), '.claude', 'commands')
    : join(process.cwd(), '.claude', 'commands');

  const count = syncSkillFiles(source.commandsDir, targetDir);
  const originLabel = source.origin === 'live'
    ? chalk.green('live prompts repo')
    : chalk.yellow('bundled snapshot');

  if (count === 0) {
    console.log(chalk.yellow('No skill files found in source. Nothing was copied.'));
    return;
  }

  console.log(chalk.green(`✓ Synced ${count} skill file(s) from ${originLabel} → ${targetDir}`));
}
