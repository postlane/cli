// SPDX-License-Identifier: BUSL-1.1
// Tests for §22.4 CLI workspace init

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync, mkdirSync, writeFileSync, readFileSync, statSync, rmSync, symlinkSync,
} from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  writeWorkspaceLocalConfig,
  writeWorkspaceConfigJson,
  appendConfigLocalToRootGitignore,
  discoverWorkspaceChildRepos,
  writeWorkspaceChildReposJson,
  assignPostsDirDedup,
} from '../src/init/workspace_writer.js';
import {
  readGlobalReposAsV2,
  addWorkspaceEntry,
  writeGlobalReposV2Atomic,
} from '../src/init/workspace_register.js';
import {
  buildVoiceGuideOutput,
  workspaceInitImpl,
  workspaceInitCommand,
  readWorkspaceSession,
  readChildRepoProjectIds,
  resolveProjectIdFromChildren,
} from '../src/commands/workspace_init.js';
import type { WorkspaceEntry, GlobalReposV2 } from '../src/app/workspace_repos.js';

// ── Test helpers ──────────────────────────────────────────────────────────────

function tmpId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function makeTmpWorkspace(repoNames: string[]): string {
  const dir = join(tmpdir(), `postlane-ws-${tmpId()}`);
  for (const name of repoNames) {
    mkdirSync(join(dir, name, '.git'), { recursive: true });
  }
  return dir;
}

function makeFakePostlaneDir(withToken = true, withPort: number | null = null): string {
  const dir = join(tmpdir(), `postlane-fake-${tmpId()}`);
  mkdirSync(dir, { recursive: true });
  if (withToken) {
    writeFileSync(join(dir, 'local.token'), 'test-local-token');
    writeFileSync(join(dir, 'session.token'), 'test-session-token');
  }
  if (withPort !== null) {
    writeFileSync(join(dir, 'port'), String(withPort));
  }
  return dir;
}

// ── 22.4.5b: config.local.json has 0600 permissions ─────────────────────────

describe('22.4.5b: config.local.json permissions on Unix', () => {
  let dir: string;
  beforeEach(() => { dir = join(tmpdir(), `postlane-perm-${tmpId()}`); mkdirSync(dir); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('creates config.local.json with 0600 permissions', () => {
    writeWorkspaceLocalConfig(dir);
    const stat = statSync(join(dir, 'config.local.json'));
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it('config.local.json contains scheduler.provider', () => {
    writeWorkspaceLocalConfig(dir);
    const content = JSON.parse(readFileSync(join(dir, 'config.local.json'), 'utf-8')) as Record<string, unknown>;
    const scheduler = content.scheduler as Record<string, unknown>;
    expect(typeof scheduler.provider).toBe('string');
  });
});

// ── 22.4.9b: voice guide hint in success output ───────────────────────────────

describe('22.4.9b: voice guide hint in output', () => {
  it('contains path to voice_guide.md', () => {
    const output = buildVoiceGuideOutput('/some/workspace');
    expect(output).toContain('voice_guide.md');
    expect(output).toContain('/some/workspace');
  });

  it('includes Claude Code variant (CLAUDE.md)', () => {
    const output = buildVoiceGuideOutput('/some/workspace');
    expect(output).toMatch(/CLAUDE\.md/i);
  });

  it('includes Cursor variant (.cursorrules)', () => {
    const output = buildVoiceGuideOutput('/some/workspace');
    expect(output).toMatch(/\.cursorrules/i);
  });
});

// ── 22.4.13: workspace init in non-git dir ────────────────────────────────────

describe('22.4.13: workspace init — non-Git directory', () => {
  let wsDir: string;
  let plDir: string;
  beforeEach(() => {
    wsDir = makeTmpWorkspace(['repo-a', 'repo-b']);
    plDir = makeFakePostlaneDir();
  });
  afterEach(() => {
    rmSync(wsDir, { recursive: true, force: true });
    rmSync(plDir, { recursive: true, force: true });
  });

  it('writes config.json with project_id and schema_version', async () => {
    await workspaceInitImpl(wsDir, 'proj-abc', plDir, null);
    const config = JSON.parse(readFileSync(join(wsDir, 'config.json'), 'utf-8')) as Record<string, unknown>;
    expect(config.project_id).toBe('proj-abc');
    expect(config.schema_version).toBe(4);
  });

  it('writes config.local.json', async () => {
    await workspaceInitImpl(wsDir, 'proj-abc', plDir, null);
    expect(existsSync(join(wsDir, 'config.local.json'))).toBe(true);
  });

  it('appends config.local.json to .gitignore', async () => {
    await workspaceInitImpl(wsDir, 'proj-abc', plDir, null);
    const gitignore = readFileSync(join(wsDir, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('config.local.json');
  });

  it('writes {workspace}/repos.json with discovered repos', async () => {
    await workspaceInitImpl(wsDir, 'proj-abc', plDir, null);
    const repos = JSON.parse(readFileSync(join(wsDir, 'repos.json'), 'utf-8')) as Record<string, unknown>;
    expect(Array.isArray(repos.repos)).toBe(true);
    expect((repos.repos as unknown[]).length).toBe(2);
  });

  it('each repo entry has posts_dir field', async () => {
    await workspaceInitImpl(wsDir, 'proj-abc', plDir, null);
    const repos = JSON.parse(readFileSync(join(wsDir, 'repos.json'), 'utf-8')) as Record<string, unknown>;
    for (const repo of repos.repos as Array<Record<string, unknown>>) {
      expect(typeof repo.posts_dir).toBe('string');
      expect((repo.posts_dir as string).length).toBeGreaterThan(0);
    }
  });

  it('adds workspace entry to global repos.json', async () => {
    await workspaceInitImpl(wsDir, 'proj-abc', plDir, null);
    const global = readGlobalReposAsV2(join(plDir, 'repos.json'));
    expect(global.workspaces.some((w) => w.id === 'proj-abc')).toBe(true);
  });
});

// ── 22.4.14: --workspace path flag ───────────────────────────────────────────

describe('22.4.14: --workspace path flag', () => {
  let wsDir: string;
  let plDir: string;
  beforeEach(() => {
    wsDir = makeTmpWorkspace(['my-repo']);
    plDir = makeFakePostlaneDir();
  });
  afterEach(() => {
    rmSync(wsDir, { recursive: true, force: true });
    rmSync(plDir, { recursive: true, force: true });
  });

  it('initialises workspace at specified absolute path', async () => {
    await workspaceInitImpl(wsDir, 'proj-xyz', plDir, null);
    expect(existsSync(join(wsDir, 'config.json'))).toBe(true);
    expect(existsSync(join(wsDir, 'config.local.json'))).toBe(true);
  });

  it('global repos.json reflects correct workspace_path', async () => {
    await workspaceInitImpl(wsDir, 'proj-xyz', plDir, null);
    const global = readGlobalReposAsV2(join(plDir, 'repos.json'));
    const entry = global.workspaces.find((w) => w.id === 'proj-xyz');
    expect(entry?.workspace_path).toBe(wsDir);
  });
});

// ── 22.4.15: idempotent reinit ────────────────────────────────────────────────

describe('22.4.15: idempotent workspace reinit', () => {
  let wsDir: string;
  let plDir: string;
  beforeEach(() => {
    wsDir = makeTmpWorkspace(['repo-1']);
    plDir = makeFakePostlaneDir();
  });
  afterEach(() => {
    rmSync(wsDir, { recursive: true, force: true });
    rmSync(plDir, { recursive: true, force: true });
  });

  it('does not overwrite config.json on second init', async () => {
    await workspaceInitImpl(wsDir, 'proj-abc', plDir, null);
    // Corrupt config.json to verify it is not overwritten
    writeFileSync(join(wsDir, 'config.json'), '{"sentinel": true}');
    await workspaceInitImpl(wsDir, 'proj-abc', plDir, null);
    const config = JSON.parse(readFileSync(join(wsDir, 'config.json'), 'utf-8')) as Record<string, unknown>;
    expect(config.sentinel).toBe(true);
  });

  it('does not duplicate workspace entry in global repos.json', async () => {
    await workspaceInitImpl(wsDir, 'proj-abc', plDir, null);
    await workspaceInitImpl(wsDir, 'proj-abc', plDir, null);
    const global = readGlobalReposAsV2(join(plDir, 'repos.json'));
    const matching = global.workspaces.filter((w) => w.id === 'proj-abc');
    expect(matching.length).toBe(1);
  });

  it('updates repos.json with newly added child repo', async () => {
    await workspaceInitImpl(wsDir, 'proj-abc', plDir, null);
    // Add a new child repo
    mkdirSync(join(wsDir, 'new-repo', '.git'), { recursive: true });
    await workspaceInitImpl(wsDir, 'proj-abc', plDir, null);
    const repos = JSON.parse(readFileSync(join(wsDir, 'repos.json'), 'utf-8')) as Record<string, unknown>;
    expect((repos.repos as unknown[]).length).toBe(2);
  });
});

// ── 22.4.17: no session token → exit 1 ───────────────────────────────────────

describe('22.4.17: no session token → exit 1', () => {
  it('exits with code 1 and sign-in message when local.token missing', async () => {
    const { vi } = await import('vitest');
    vi.resetModules();

    const tmpWs = makeTmpWorkspace(['repo-x']);
    const plDir = makeFakePostlaneDir(false);  // no token
    const errorMessages: string[] = [];
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errorMessages.push(args.map(String).join(' '));
    });
    let exitCode: number | undefined;
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      exitCode = code as number;
      throw new Error('exit-sentinel');
    });

    try {
      await workspaceInitCommand(tmpWs, plDir);
    } catch {
      // swallow exit sentinel
    } finally {
      consoleSpy.mockRestore();
      exitSpy.mockRestore();
      rmSync(tmpWs, { recursive: true, force: true });
      rmSync(plDir, { recursive: true, force: true });
    }

    expect(exitCode).toBe(1);
    expect(errorMessages.join('\n').toLowerCase()).toMatch(/sign in/i);
  });
});

// ── 22.4.18: --workspace path not found → exit 1 ─────────────────────────────

describe('22.4.18: --workspace path not found → exit 1', () => {
  it('exits with code 1 when workspace dir does not exist', async () => {
    const { vi } = await import('vitest');
    const plDir = makeFakePostlaneDir();
    const missingPath = join(tmpdir(), `no-such-dir-${tmpId()}`);
    let exitCode: number | undefined;
    const errorMessages: string[] = [];

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errorMessages.push(args.map(String).join(' '));
    });
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      exitCode = code as number;
      throw new Error('exit-sentinel');
    });

    try {
      await workspaceInitCommand(missingPath, plDir);
    } catch {
      // swallow
    } finally {
      consoleSpy.mockRestore();
      exitSpy.mockRestore();
      rmSync(plDir, { recursive: true, force: true });
    }

    expect(exitCode).toBe(1);
    expect(errorMessages.join('\n')).toMatch(/not found/i);
  });
});

// ── 22.4.19: desktop not running → direct write to ~/.postlane/repos.json ────

describe('22.4.19: desktop not running → direct write', () => {
  let wsDir: string;
  let plDir: string;
  beforeEach(() => {
    wsDir = makeTmpWorkspace(['repo-a']);
    // No port file → desktop not running
    plDir = makeFakePostlaneDir(true, null);
  });
  afterEach(() => {
    rmSync(wsDir, { recursive: true, force: true });
    rmSync(plDir, { recursive: true, force: true });
  });

  it('writes workspace entry directly to repos.json when port absent', async () => {
    await workspaceInitImpl(wsDir, 'proj-direct', plDir, null);
    const reposPath = join(plDir, 'repos.json');
    expect(existsSync(reposPath)).toBe(true);
    const global = readGlobalReposAsV2(reposPath);
    expect(global.workspaces.some((w) => w.id === 'proj-direct')).toBe(true);
  });

  it('preserves existing workspaces and repos arrays', async () => {
    // Pre-populate repos.json with an existing workspace and repo
    const existing: GlobalReposV2 = {
      version: 2,
      workspaces: [{ id: 'old-proj', name: 'old', workspace_path: '/old', active: true, added_at: new Date().toISOString() }],
      repos: [{ id: 'r1', name: 'legacy', path: '/legacy', active: true, added_at: new Date().toISOString() }],
    };
    writeGlobalReposV2Atomic(join(plDir, 'repos.json'), existing);

    await workspaceInitImpl(wsDir, 'proj-new', plDir, null);

    const global = readGlobalReposAsV2(join(plDir, 'repos.json'));
    expect(global.workspaces.some((w) => w.id === 'old-proj')).toBe(true);
    expect(global.workspaces.some((w) => w.id === 'proj-new')).toBe(true);
    expect(global.repos.some((r) => r.name === 'legacy')).toBe(true);
  });
});

// ── Additional unit tests for workspace_writer helpers ────────────────────────

describe('assignPostsDirDedup', () => {
  it('returns basename when no collision', () => {
    expect(assignPostsDirDedup('frontend', [])).toBe('frontend');
  });

  it('returns frontend-2 on first collision', () => {
    expect(assignPostsDirDedup('frontend', ['frontend'])).toBe('frontend-2');
  });

  it('returns frontend-3 on two collisions', () => {
    expect(assignPostsDirDedup('frontend', ['frontend', 'frontend-2'])).toBe('frontend-3');
  });
});

describe('readGlobalReposAsV2', () => {
  it('returns empty v2 when file absent', () => {
    const result = readGlobalReposAsV2(join(tmpdir(), `no-repos-${tmpId()}.json`));
    expect(result.version).toBe(2);
    expect(result.workspaces).toEqual([]);
    expect(result.repos).toEqual([]);
  });

  it('upgrades v1 (no workspaces) to v2 preserving repos', () => {
    const dir = join(tmpdir(), `postlane-upgrade-${tmpId()}`);
    mkdirSync(dir);
    const v1 = { version: 1, repos: [{ id: 'r1', name: 'n', path: '/p', active: true, added_at: '2024-01-01T00:00:00.000Z' }] };
    const p = join(dir, 'repos.json');
    writeFileSync(p, JSON.stringify(v1));
    const result = readGlobalReposAsV2(p);
    expect(result.workspaces).toEqual([]);
    expect(result.repos.length).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('addWorkspaceEntry', () => {
  it('creates repos.json with workspace entry when absent', () => {
    const dir = join(tmpdir(), `postlane-add-ws-${tmpId()}`);
    mkdirSync(dir);
    const p = join(dir, 'repos.json');
    const entry: WorkspaceEntry = { id: 'w1', name: 'ws', workspace_path: '/ws', active: true, added_at: new Date().toISOString() };
    addWorkspaceEntry(p, entry);
    const result = readGlobalReposAsV2(p);
    expect(result.workspaces.some((w) => w.id === 'w1')).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it('does not duplicate an existing entry (idempotent)', () => {
    const dir = join(tmpdir(), `postlane-dedup-${tmpId()}`);
    mkdirSync(dir);
    const p = join(dir, 'repos.json');
    const entry: WorkspaceEntry = { id: 'w1', name: 'ws', workspace_path: '/ws', active: true, added_at: new Date().toISOString() };
    addWorkspaceEntry(p, entry);
    addWorkspaceEntry(p, entry);
    const result = readGlobalReposAsV2(p);
    expect(result.workspaces.filter((w) => w.id === 'w1').length).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('discoverWorkspaceChildRepos', () => {
  it('finds git repos one level deep', () => {
    const dir = makeTmpWorkspace(['repo-a', 'repo-b']);
    const found = discoverWorkspaceChildRepos(dir);
    expect(found.length).toBe(2);
    rmSync(dir, { recursive: true, force: true });
  });

  it('ignores symlinks', () => {
    const dir = join(tmpdir(), `postlane-sym-${tmpId()}`);
    const realRepo = join(tmpdir(), `postlane-real-${tmpId()}`);
    mkdirSync(join(realRepo, '.git'), { recursive: true });
    mkdirSync(dir);
    symlinkSync(realRepo, join(dir, 'sym-repo'));
    const found = discoverWorkspaceChildRepos(dir);
    expect(found.length).toBe(0);
    rmSync(dir, { recursive: true, force: true });
    rmSync(realRepo, { recursive: true, force: true });
  });
});

describe('readWorkspaceSession', () => {
  it('returns null when local.token absent', () => {
    const dir = makeFakePostlaneDir(false);
    const result = readWorkspaceSession(dir);
    expect(result).toBeNull();
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns session with null port when no port file', () => {
    const dir = makeFakePostlaneDir(true, null);
    const result = readWorkspaceSession(dir);
    expect(result).not.toBeNull();
    expect(result?.port).toBeNull();
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns port when port file present and valid', () => {
    const dir = makeFakePostlaneDir(true, 47312);
    const result = readWorkspaceSession(dir);
    expect(result?.port).toBe(47312);
    rmSync(dir, { recursive: true, force: true });
  });
});

// ── 22.4.12: workspace adoption ───────────────────────────────────────────────

describe('readChildRepoProjectIds', () => {
  it('returns project_ids from child repos that have .postlane/config.json', () => {
    const dir = join(tmpdir(), `postlane-adopt-${tmpId()}`);
    const repoA = join(dir, 'repo-a');
    const repoB = join(dir, 'repo-b');
    mkdirSync(join(repoA, '.postlane'), { recursive: true });
    mkdirSync(join(repoB, '.postlane'), { recursive: true });
    writeFileSync(join(repoA, '.postlane', 'config.json'), JSON.stringify({ project_id: 'pid-aaa' }));
    writeFileSync(join(repoB, '.postlane', 'config.json'), JSON.stringify({ project_id: 'pid-bbb' }));

    const result = readChildRepoProjectIds([repoA, repoB]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ path: repoA, projectId: 'pid-aaa' });
    expect(result[1]).toEqual({ path: repoB, projectId: 'pid-bbb' });
    rmSync(dir, { recursive: true, force: true });
  });

  it('skips child repos with no .postlane/config.json', () => {
    const dir = join(tmpdir(), `postlane-adopt-${tmpId()}`);
    const repoA = join(dir, 'repo-a');
    const repoB = join(dir, 'repo-b');
    mkdirSync(join(repoA, '.postlane'), { recursive: true });
    mkdirSync(join(repoB, '.postlane'), { recursive: true });
    writeFileSync(join(repoA, '.postlane', 'config.json'), JSON.stringify({ project_id: 'pid-aaa' }));
    // repoB has no config.json

    const result = readChildRepoProjectIds([repoA, repoB]);
    expect(result).toHaveLength(1);
    expect(result[0].projectId).toBe('pid-aaa');
    rmSync(dir, { recursive: true, force: true });
  });

  it('skips child repos whose config.json has no project_id field', () => {
    const dir = join(tmpdir(), `postlane-adopt-${tmpId()}`);
    const repoA = join(dir, 'repo-a');
    mkdirSync(join(repoA, '.postlane'), { recursive: true });
    writeFileSync(join(repoA, '.postlane', 'config.json'), JSON.stringify({ version: 1 }));

    const result = readChildRepoProjectIds([repoA]);
    expect(result).toHaveLength(0);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('resolveProjectIdFromChildren', () => {
  it('returns the common project_id when all children agree', () => {
    const children = [
      { path: '/a', projectId: 'pid-x' },
      { path: '/b', projectId: 'pid-x' },
    ];
    const { projectId, hasMismatch } = resolveProjectIdFromChildren(children);
    expect(projectId).toBe('pid-x');
    expect(hasMismatch).toBe(false);
  });

  it('returns null and hasMismatch true when children disagree', () => {
    const children = [
      { path: '/a', projectId: 'pid-x' },
      { path: '/b', projectId: 'pid-y' },
    ];
    const { projectId, hasMismatch } = resolveProjectIdFromChildren(children);
    expect(projectId).toBeNull();
    expect(hasMismatch).toBe(true);
  });

  it('returns null and hasMismatch false when no children have project_ids', () => {
    const { projectId, hasMismatch } = resolveProjectIdFromChildren([]);
    expect(projectId).toBeNull();
    expect(hasMismatch).toBe(false);
  });
});

describe('22.4.12: workspace adoption uses child repo project_ids', () => {
  it('workspaceInitImpl uses project_id from child repos when all agree', async () => {
    const dir = join(tmpdir(), `postlane-adopt-full-${tmpId()}`);
    const repoA = join(dir, 'repo-a');
    mkdirSync(join(repoA, '.git'), { recursive: true });
    mkdirSync(join(repoA, '.postlane'), { recursive: true });
    writeFileSync(join(repoA, '.postlane', 'config.json'), JSON.stringify({ project_id: 'adopted-pid' }));
    const postlaneDir = join(tmpdir(), `postlane-fake-${tmpId()}`);
    mkdirSync(postlaneDir, { recursive: true });
    writeFileSync(join(postlaneDir, 'local.token'), 'tok');

    const result = await workspaceInitImpl(dir, 'adopted-pid', postlaneDir, { port: null, token: 'tok' });
    const wsConfig = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf-8'));
    expect(wsConfig.project_id).toBe('adopted-pid');
    expect(result.projectId).toBe('adopted-pid');
    rmSync(dir, { recursive: true, force: true });
    rmSync(postlaneDir, { recursive: true, force: true });
  });
});
