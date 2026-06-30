// SPDX-License-Identifier: BUSL-1.1

import { existsSync, readFileSync, mkdirSync } from 'fs';
import { join, resolve, basename, isAbsolute } from 'path';
import chalk from 'chalk';
import { randomUUID } from 'crypto';
import type { WorkspaceEntry } from '../app/workspace_repos.js';
import { readPortFile } from '../app/session.js';
import {
  writeWorkspaceConfigJson,
  writeWorkspaceLocalConfig,
  appendConfigLocalToRootGitignore,
  discoverWorkspaceChildRepos,
  writeWorkspaceChildReposJson,
} from '../init/workspace_writer.js';
import { registerWorkspace } from '../init/workspace_register.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WorkspaceInitResult {
  workspacePath: string;
  projectId: string;
  childRepoCount: number;
}

interface SessionInfo {
  port: number | null;
  token: string;
}

// ── Session reading ───────────────────────────────────────────────────────────

export function readWorkspaceSession(postlaneDir: string): SessionInfo | null {
  const tokenPath = join(postlaneDir, 'local.token');
  if (!existsSync(tokenPath)) return null;
  const token = readFileSync(tokenPath, 'utf-8').trim();
  if (!token) return null;

  return { port: readPortFile(postlaneDir), token };
}

// ── Project ID fetch ──────────────────────────────────────────────────────────

interface ProjectSummary { id: string; name: string; }

function isProjectSummaryArray(val: unknown): val is ProjectSummary[] {
  if (!Array.isArray(val)) return false;
  return (val as unknown[]).every((item) => {
    if (typeof item !== 'object' || item === null) return false;
    const obj = item as Record<string, unknown>;
    return typeof obj.id === 'string' && typeof obj.name === 'string';
  });
}

export async function fetchProjectId(port: number, token: string): Promise<string | null> {
  const url = `http://127.0.0.1:${port}/api/v1/projects`;
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    if (!isProjectSummaryArray(data) || data.length === 0) return null;
    return data[0].id;
  } catch {
    return null;
  }
}

// ── Voice guide output ────────────────────────────────────────────────────────

export function buildVoiceGuideOutput(workspacePath: string): string {
  const voicePath = join(workspacePath, 'voice_guide.md');
  return [
    '',
    chalk.cyan('  Voice guide setup:'),
    `  Path: ${voicePath}`,
    chalk.gray('  Claude Code (CLAUDE.md):'),
    chalk.gray(`    Add: @${voicePath}`),
    chalk.gray('  Cursor (.cursorrules):'),
    chalk.gray(`    Add: @${voicePath}`),
    chalk.gray('  Other tools: reference the path in your tool\'s context configuration.'),
  ].join('\n');
}

// ── Child repo adoption (22.4.12) ─────────────────────────────────────────────

/** Reads `project_id` from `{childPath}/.postlane/config.json` for each path that has one. */
export function readChildRepoProjectIds(
  childPaths: string[],
): { path: string; projectId: string }[] {
  const results: { path: string; projectId: string }[] = [];
  for (const childPath of childPaths) {
    const configPath = join(childPath, '.postlane', 'config.json');
    if (!existsSync(configPath)) continue;
    try {
      const raw: unknown = JSON.parse(readFileSync(configPath, 'utf-8'));
      if (typeof raw !== 'object' || raw === null) continue;
      const pid = (raw as Record<string, unknown>).project_id;
      if (typeof pid === 'string' && pid.length > 0) {
        results.push({ path: childPath, projectId: pid });
      }
    } catch {
      // skip unreadable / malformed configs
    }
  }
  return results;
}

/** Returns the common project_id if all children agree, or null with hasMismatch=true if they disagree. */
export function resolveProjectIdFromChildren(
  children: { path: string; projectId: string }[],
): { projectId: string | null; hasMismatch: boolean } {
  if (children.length === 0) return { projectId: null, hasMismatch: false };
  const unique = new Set(children.map((c) => c.projectId));
  if (unique.size === 1) return { projectId: children[0].projectId, hasMismatch: false };
  return { projectId: null, hasMismatch: true };
}

// ── Core implementation (pure — no process.exit) ──────────────────────────────

export async function workspaceInitImpl(
  dir: string,
  projectId: string,
  postlaneDir: string,
  session: SessionInfo | null,
): Promise<WorkspaceInitResult> {
  if (!isAbsolute(dir)) {
    throw new Error(`workspace dir must be absolute, got: ${dir}`);
  }
  if (!existsSync(dir)) {
    throw new Error(`Directory not found: ${dir}`);
  }

  const configPath = join(dir, 'config.json');
  const isReinit = existsSync(configPath);

  if (!isReinit) {
    writeWorkspaceConfigJson(dir, projectId);
    writeWorkspaceLocalConfig(dir);
    appendConfigLocalToRootGitignore(dir);
  }

  mkdirSync(join(dir, 'posts'), { recursive: true });

  const childPaths = discoverWorkspaceChildRepos(dir);
  const childRepos = writeWorkspaceChildReposJson(dir, childPaths);

  const workspaceName = basename(dir);
  const entry: WorkspaceEntry = {
    id: projectId,
    name: workspaceName,
    workspace_path: dir,
    active: true,
    added_at: new Date().toISOString(),
  };

  await registerWorkspace(postlaneDir, session?.port ?? null, session?.token ?? '', entry);

  return {
    workspacePath: dir,
    projectId,
    childRepoCount: childRepos.length,
  };
}

// ── Command entry point ───────────────────────────────────────────────────────

export async function workspaceInitCommand(
  dir: string,
  postlaneDir: string,
): Promise<void> {
  if (!existsSync(dir)) {
    console.error(chalk.red(`Error: Directory not found: ${dir}`));
    process.exit(1);
  }

  const session = readWorkspaceSession(postlaneDir);
  if (!session) {
    console.error(chalk.red('Sign in to Postlane first: open the desktop app and complete the setup wizard.'));
    process.exit(1);
  }

  const configPath = join(dir, 'config.json');
  const isReinit = existsSync(configPath);

  // 22.4.12: read project_ids from existing child repo configs before deciding.
  const childPaths = discoverWorkspaceChildRepos(dir);
  const childIds = readChildRepoProjectIds(childPaths);
  const { projectId: childProjectId, hasMismatch } = resolveProjectIdFromChildren(childIds);

  if (hasMismatch) {
    console.warn(chalk.yellow(
      'Warning: child repos have different project_ids. Workspace project_id will be determined from your session.',
    ));
  }

  let projectId: string | null = null;

  if (isReinit) {
    // Workspace wins on conflict (22.4.12): keep existing workspace project_id.
    const existing: unknown = JSON.parse(readFileSync(configPath, 'utf-8'));
    const existingPid = (typeof existing === 'object' && existing !== null)
      ? (existing as Record<string, unknown>).project_id
      : undefined;
    projectId = typeof existingPid === 'string' ? existingPid : null;
    if (projectId && childProjectId && projectId !== childProjectId) {
      console.warn(chalk.yellow(
        `Warning: child repos have project_id ${childProjectId} but workspace uses ${projectId}. Keeping workspace id.`,
      ));
    }
  }

  if (!projectId) {
    // For new workspaces: child ids take priority over live session (adoption).
    projectId = childProjectId;
  }

  if (!projectId && session.port !== null) {
    projectId = await fetchProjectId(session.port, session.token);
  }

  if (!projectId) {
    projectId = readProjectIdFromExistingConfig(postlaneDir) ?? randomUUID();
  }

  if (isReinit) {
    console.log(chalk.yellow(`Workspace already initialised at ${dir}. Updating child repo list.`));
  } else {
    console.log(chalk.blue('No Git repo found in current directory — initialising as a workspace.'));
  }

  const result = await workspaceInitImpl(resolve(dir), projectId, postlaneDir, session);

  const repoWord = result.childRepoCount === 1 ? 'repository' : 'repositories';
  console.log(chalk.green(`\n✓ Workspace initialised at ${result.workspacePath}`));
  console.log(chalk.green(`✓ Found ${result.childRepoCount} ${repoWord}`));
  console.log(chalk.green('✓ config.local.json added to .gitignore'));
  console.log(chalk.green('✓ Workspace registered — open the Postlane desktop app to see your queue'));
  console.log(buildVoiceGuideOutput(result.workspacePath));
}

function readProjectIdFromExistingConfig(postlaneDir: string): string | null {
  const reposPath = join(postlaneDir, 'repos.json');
  if (!existsSync(reposPath)) return null;
  try {
    const content = readFileSync(reposPath, 'utf-8');
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const obj = parsed as Record<string, unknown>;
    const workspaces = obj.workspaces;
    if (!Array.isArray(workspaces) || workspaces.length === 0) return null;
    const first = workspaces[0] as Record<string, unknown>;
    return typeof first.id === 'string' ? first.id : null;
  } catch {
    return null;
  }
}
