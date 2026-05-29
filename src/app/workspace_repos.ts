// SPDX-License-Identifier: BUSL-1.1

import type { Repo } from './repos.js';

// ── Workspace child-repo registry: {workspace}/repos.json ────────────────────

export interface WorkspaceChildRepo {
  id: string;
  name: string;
  path: string;
  posts_dir: string;
  active: boolean;
  added_at: string;
}

export interface WorkspaceChildReposConfig {
  version: number;
  repos: WorkspaceChildRepo[];
}

// ── Global ~/.postlane/repos.json v2 schema ───────────────────────────────────

export interface WorkspaceEntry {
  id: string;           // = project_id
  name: string;         // = basename(workspace_path)
  workspace_path: string;
  active: boolean;
  added_at: string;
}

export interface GlobalReposV2 {
  version: number;
  workspaces: WorkspaceEntry[];
  repos: Repo[];
}

// ── Type guards ───────────────────────────────────────────────────────────────

function isWorkspaceChildRepo(val: unknown): val is WorkspaceChildRepo {
  if (typeof val !== 'object' || val === null) return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.path === 'string' &&
    typeof obj.posts_dir === 'string' &&
    typeof obj.active === 'boolean' &&
    typeof obj.added_at === 'string'
  );
}

export function isWorkspaceChildReposConfig(val: unknown): val is WorkspaceChildReposConfig {
  if (typeof val !== 'object' || val === null) return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj.version === 'number' &&
    Array.isArray(obj.repos) &&
    (obj.repos as unknown[]).every(isWorkspaceChildRepo)
  );
}

function isWorkspaceEntry(val: unknown): val is WorkspaceEntry {
  if (typeof val !== 'object' || val === null) return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.workspace_path === 'string' &&
    typeof obj.active === 'boolean' &&
    typeof obj.added_at === 'string'
  );
}

export function isGlobalReposV2(val: unknown): val is GlobalReposV2 {
  if (typeof val !== 'object' || val === null) return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj.version === 'number' &&
    Array.isArray(obj.workspaces) &&
    (obj.workspaces as unknown[]).every(isWorkspaceEntry) &&
    Array.isArray(obj.repos)
  );
}
