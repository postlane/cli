// SPDX-License-Identifier: BUSL-1.1

import {
  writeFileSync, readFileSync, existsSync, openSync, writeSync, closeSync,
  readdirSync, lstatSync, mkdirSync, renameSync,
} from 'fs';
import { join, basename } from 'path';
import { randomUUID } from 'crypto';
import type { WorkspaceChildRepo, WorkspaceChildReposConfig } from '../app/workspace_repos.js';

// ── Workspace config.json ─────────────────────────────────────────────────────

export function writeWorkspaceConfigJson(dir: string, projectId: string): void {
  const config = { project_id: projectId, schema_version: 4 };
  const tmpPath = join(dir, 'config.json.tmp');
  writeFileSync(tmpPath, JSON.stringify(config, null, 2), 'utf-8');
  renameSync(tmpPath, join(dir, 'config.json'));
}

// ── Workspace config.local.json with 0600 permissions (22.4.5a) ──────────────

export function writeWorkspaceLocalConfig(dir: string): void {
  const content = JSON.stringify({ scheduler: { provider: '' } }, null, 2);
  const dest = join(dir, 'config.local.json');

  // Write atomically via tmp file, then set 0600 and rename.
  const tmpPath = dest + '.tmp';

  /* c8 ignore next 3 — non-Unix path tested on Unix only */
  const fd = openSync(tmpPath, 'w', 0o600);
  writeSync(fd, content, 0, 'utf-8');
  closeSync(fd);

  renameSync(tmpPath, dest);
}

// ── .gitignore at workspace root ──────────────────────────────────────────────

export function appendConfigLocalToRootGitignore(dir: string): void {
  const gitignorePath = join(dir, '.gitignore');
  const entry = 'config.local.json';

  if (existsSync(gitignorePath)) {
    const existing = readFileSync(gitignorePath, 'utf-8');
    const lines = existing.split('\n').map((l) => l.trim());
    if (lines.includes(entry)) return;
    const separator = existing.endsWith('\n') ? '' : '\n';
    writeFileSync(gitignorePath, existing + separator + entry + '\n', 'utf-8');
  } else {
    writeFileSync(gitignorePath, entry + '\n', 'utf-8');
  }
}

// ── Child repo discovery (one level deep) ─────────────────────────────────────

export function discoverWorkspaceChildRepos(dir: string): string[] {
  let entries: import('fs').Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const found: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const childPath = join(dir, String(entry.name));
    try {
      if (lstatSync(join(childPath, '.git')).isDirectory()) {
        found.push(childPath);
      }
    } catch {
      // not a git repo — skip
    }
  }
  return found;
}

// ── posts_dir deduplication (mirrors Rust assign_posts_dir) ──────────────────

export function assignPostsDirDedup(repoName: string, existingDirs: string[]): string {
  const used = new Set(existingDirs);
  if (!used.has(repoName)) return repoName;
  for (let n = 2; n <= 1000; n++) {
    const candidate = `${repoName}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${repoName}-${randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

// ── {workspace}/repos.json ────────────────────────────────────────────────────

export function writeWorkspaceChildReposJson(
  dir: string,
  childPaths: string[],
): WorkspaceChildRepo[] {
  const entries: WorkspaceChildRepo[] = [];
  const usedDirs: string[] = [];

  for (const childPath of childPaths) {
    const name = basename(childPath);
    const postsDir = assignPostsDirDedup(name, usedDirs);
    usedDirs.push(postsDir);
    entries.push({
      id: randomUUID(),
      name,
      path: childPath,
      posts_dir: postsDir,
      active: true,
      added_at: new Date().toISOString(),
    });
  }

  const config: WorkspaceChildReposConfig = { version: 1, repos: entries };
  const tmpPath = join(dir, 'repos.json.tmp');
  writeFileSync(tmpPath, JSON.stringify(config, null, 2), 'utf-8');
  renameSync(tmpPath, join(dir, 'repos.json'));
  return entries;
}
