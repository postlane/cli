// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect } from 'vitest';
import { isRepo, isReposConfig } from '../src/app/repos.js';

describe('isRepo', () => {
  it('accepts a valid Repo object', () => {
    expect(isRepo({
      id: 'abc',
      name: 'my-repo',
      path: '/home/user/repo',
      active: true,
      added_at: '2024-01-01T00:00:00.000Z',
    })).toBe(true);
  });

  it('rejects null', () => {
    expect(isRepo(null)).toBe(false);
  });

  it('rejects non-object', () => {
    expect(isRepo('string')).toBe(false);
    expect(isRepo(42)).toBe(false);
  });

  it('rejects missing fields', () => {
    expect(isRepo({ id: 'x', name: 'y', path: '/p', active: true })).toBe(false); // missing added_at
    expect(isRepo({ id: 'x', name: 'y', path: '/p', added_at: '' })).toBe(false); // missing active
  });

  it('rejects wrong field types', () => {
    expect(isRepo({ id: 1, name: 'y', path: '/p', active: true, added_at: '' })).toBe(false);
    expect(isRepo({ id: 'x', name: 'y', path: '/p', active: 'yes', added_at: '' })).toBe(false);
  });
});

describe('isReposConfig', () => {
  const validRepo = { id: 'a', name: 'b', path: '/c', active: false, added_at: '2024-01-01T00:00:00Z' };

  it('accepts a valid ReposConfig', () => {
    expect(isReposConfig({ version: 1, repos: [validRepo] })).toBe(true);
  });

  it('accepts empty repos array', () => {
    expect(isReposConfig({ version: 1, repos: [] })).toBe(true);
  });

  it('rejects null', () => {
    expect(isReposConfig(null)).toBe(false);
  });

  it('rejects missing version', () => {
    expect(isReposConfig({ repos: [] })).toBe(false);
  });

  it('rejects non-number version', () => {
    expect(isReposConfig({ version: '1', repos: [] })).toBe(false);
  });

  it('rejects non-array repos', () => {
    expect(isReposConfig({ version: 1, repos: 'not-array' })).toBe(false);
  });

  it('rejects repos array with invalid entry', () => {
    expect(isReposConfig({ version: 1, repos: [{ bad: true }] })).toBe(false);
  });
});
