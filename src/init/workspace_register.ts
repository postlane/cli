// SPDX-License-Identifier: BUSL-1.1

import {
  existsSync, readFileSync, writeFileSync, renameSync,
} from 'fs';
import { join } from 'path';
import type { Repo } from '../app/repos.js';
import { isRepo } from '../app/repos.js';
import type { GlobalReposV2, WorkspaceEntry } from '../app/workspace_repos.js';
import { isGlobalReposV2 } from '../app/workspace_repos.js';

// ── Read/write global ~/.postlane/repos.json ──────────────────────────────────

export function readGlobalReposAsV2(reposPath: string): GlobalReposV2 {
  if (!existsSync(reposPath)) {
    return { version: 2, workspaces: [], repos: [] };
  }
  try {
    const content = readFileSync(reposPath, 'utf-8');
    const parsed: unknown = JSON.parse(content);
    if (isGlobalReposV2(parsed)) return parsed;

    // Upgrade v1 (no workspaces array) while preserving legacy repos.
    if (isLegacyV1Config(parsed)) {
      return { version: 2, workspaces: [], repos: parsed.repos };
    }
    return { version: 2, workspaces: [], repos: [] };
  } catch {
    return { version: 2, workspaces: [], repos: [] };
  }
}

function isLegacyV1Config(val: unknown): val is { version: number; repos: Repo[] } {
  if (typeof val !== 'object' || val === null) return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj.version === 'number' &&
    Array.isArray(obj.repos) &&
    (obj.repos as unknown[]).every(isRepo)
  );
}

export function writeGlobalReposV2Atomic(reposPath: string, config: GlobalReposV2): void {
  const tmpPath = reposPath + '.tmp';
  writeFileSync(tmpPath, JSON.stringify(config, null, 2), { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmpPath, reposPath);
}

// ── Idempotent workspace entry registration ───────────────────────────────────

export function addWorkspaceEntry(reposPath: string, entry: WorkspaceEntry): void {
  const current = readGlobalReposAsV2(reposPath);
  if (current.workspaces.some((w) => w.id === entry.id)) return;
  const updated: GlobalReposV2 = {
    ...current,
    workspaces: [...current.workspaces, entry],
  };
  writeGlobalReposV2Atomic(reposPath, updated);
}

// ── HTTP registration (when desktop is running) ───────────────────────────────

export async function registerWorkspaceViaHttp(
  port: number,
  token: string,
  entry: WorkspaceEntry,
): Promise<boolean> {
  const url = `http://127.0.0.1:${port}/register-workspace`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        workspace_path: entry.workspace_path,
        name: entry.name,
        project_id: entry.id,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ── Main registration: HTTP first, direct write fallback ──────────────────────

export async function registerWorkspace(
  postlaneDir: string,
  port: number | null,
  token: string,
  entry: WorkspaceEntry,
): Promise<void> {
  const reposPath = join(postlaneDir, 'repos.json');

  if (port !== null) {
    const ok = await registerWorkspaceViaHttp(port, token, entry);
    if (ok) return;
  }

  addWorkspaceEntry(reposPath, entry);
}
