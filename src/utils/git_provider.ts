// SPDX-License-Identifier: BUSL-1.1

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export type GitProvider = 'github' | 'gitlab' | 'other';

function originRemoteUrl(gitConfigContent: string): string | null {
  let inOrigin = false;
  for (const line of gitConfigContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '[remote "origin"]') { inOrigin = true; continue; }
    if (inOrigin) {
      if (trimmed.startsWith('[')) break;
      const match = /^url\s*=\s*(.+)$/.exec(trimmed);
      if (match) return match[1].trim();
    }
  }
  return null;
}

function domainFromUrl(url: string): string {
  // HTTPS: https://github.com/...  → github.com
  const httpsMatch = /^https?:\/\/([^/]+)/.exec(url);
  if (httpsMatch) return httpsMatch[1].toLowerCase();
  // SSH: git@github.com:...  → github.com
  const sshMatch = /^[^@]+@([^:]+):/.exec(url);
  if (sshMatch) return sshMatch[1].toLowerCase();
  return '';
}

/// Detects the Git hosting provider for the repo at `repoPath` by reading the
/// origin remote URL from `.git/config`.  Returns `'other'` when no remote is
/// configured or the `.git` directory is absent.
export function detectGitProvider(repoPath: string): GitProvider {
  const gitConfigPath = join(repoPath, '.git', 'config');
  if (!existsSync(gitConfigPath)) return 'other';

  const content = readFileSync(gitConfigPath, 'utf-8');
  const url = originRemoteUrl(content);
  if (!url) return 'other';

  const domain = domainFromUrl(url);
  if (domain === 'github.com' || domain.endsWith('.github.com')) return 'github';
  if (domain === 'gitlab.com' || domain.endsWith('.gitlab.com')) return 'gitlab';
  return 'other';
}
