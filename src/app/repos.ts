// SPDX-License-Identifier: BUSL-1.1

export interface Repo {
  id: string;
  name: string;
  path: string;
  active: boolean;
  added_at: string;
}

export interface ReposConfig {
  version: number;
  repos: Repo[];
}

export function isRepo(val: unknown): val is Repo {
  if (typeof val !== 'object' || val === null) return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.path === 'string' &&
    typeof obj.active === 'boolean' &&
    typeof obj.added_at === 'string'
  );
}

export function isReposConfig(val: unknown): val is ReposConfig {
  if (typeof val !== 'object' || val === null) return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj.version === 'number' &&
    Array.isArray(obj.repos) &&
    (obj.repos as unknown[]).every(isRepo)
  );
}
