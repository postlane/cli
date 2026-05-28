// SPDX-License-Identifier: BUSL-1.1

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

function isGitHubProjectConfig(val: unknown): val is GitHubProjectConfig {
  if (typeof val !== 'object' || val === null) return false;
  const obj = val as Record<string, unknown>;
  const { project_id, project_name } = obj;
  return (
    typeof project_id === 'string' && project_id.length > 0 &&
    typeof project_name === 'string' && project_name.length > 0
  );
}

export interface GitHubProjectConfig {
  project_id: string;
  project_name: string;
}

export interface AppSessionInfo {
  port: number;
  token: string;
}

/// Reads the running desktop app's port and session token from ~/.postlane/.
/// Returns null when either file is absent or contains an invalid value.
export function readAppSessionInfo(): AppSessionInfo | null {
  const postlaneDir = join(homedir(), '.postlane');
  const portPath = join(postlaneDir, 'port');
  const tokenPath = join(postlaneDir, 'session.token');

  if (!existsSync(portPath) || !existsSync(tokenPath)) return null;

  const portStr = readFileSync(portPath, 'utf-8').trim();
  const port = Number(portStr);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;

  const token = readFileSync(tokenPath, 'utf-8').trim();
  if (!token) return null;

  return { port, token };
}

/// Calls the running desktop app to get the project config for a GitHub org.
/// Returns null when the app is not running, org is not found, or any error occurs.
export async function fetchGitHubProjectConfig(
  orgLogin: string,
  port: number,
  token: string,
): Promise<GitHubProjectConfig | null> {
  const url = `http://127.0.0.1:${port}/github-project-config?org_login=${encodeURIComponent(orgLogin)}`;
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    if (!isGitHubProjectConfig(data)) {
      console.warn(
        `[postlane] Postlane app returned unexpected project config shape from ${url}. ` +
        'Upgrade the Postlane desktop app if this persists.',
      );
      return null;
    }
    return data;
  } catch {
    return null;
  }
}
