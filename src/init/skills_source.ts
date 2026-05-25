// SPDX-License-Identifier: BUSL-1.1

import { existsSync, mkdirSync, copyFileSync, readdirSync } from 'fs';
import { join } from 'path';

export interface SkillsSource {
  commandsDir: string;
  origin: 'live' | 'bundled';
}

/**
 * Resolves where to read skill files from.
 * Prefers the live sibling prompts repo over the bundled snapshot so that
 * `postlane init` and `postlane sync-skills` always deploy the latest source.
 */
export function resolveSkillsSource(cliDir: string): SkillsSource {
  const liveCommandsDir = join(cliDir, '..', 'prompts', 'commands');
  if (existsSync(liveCommandsDir)) {
    return { commandsDir: liveCommandsDir, origin: 'live' };
  }
  return {
    commandsDir: join(cliDir, 'bundled-skills', 'commands'),
    origin: 'bundled',
  };
}

/**
 * Copies `.md` skill files from `sourceDir` to `targetDir`.
 * Creates `targetDir` if absent. Returns count of files copied.
 */
export function syncSkillFiles(sourceDir: string, targetDir: string): number {
  mkdirSync(targetDir, { recursive: true });
  if (!existsSync(sourceDir)) return 0;

  const files = readdirSync(sourceDir).filter((f) => f.endsWith('.md'));
  for (const file of files) {
    copyFileSync(join(sourceDir, file), join(targetDir, file));
  }
  return files.length;
}
