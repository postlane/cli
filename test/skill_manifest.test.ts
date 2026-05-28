// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect } from 'vitest';
import { SKILL_FILE_NAMES } from '../src/app/skill_manifest.js';

describe('SKILL_FILE_NAMES', () => {
  it('is a readonly array of strings', () => {
    expect(Array.isArray(SKILL_FILE_NAMES)).toBe(true);
    for (const name of SKILL_FILE_NAMES) {
      expect(typeof name).toBe('string');
    }
  });

  it('contains draft-post.md', () => {
    expect(SKILL_FILE_NAMES).toContain('draft-post.md');
  });

  it('contains register-repo.md', () => {
    expect(SKILL_FILE_NAMES).toContain('register-repo.md');
  });

  it('contains all expected skill files', () => {
    const expected = [
      'draft-post.md',
      'register-repo.md',
      'draft-changelog.md',
      'draft-show-hn.md',
      'draft-product-hunt.md',
      'redraft-post.md',
      'draft-x.md',
      'draft-bluesky.md',
      'draft-mastodon.md',
      'draft-linkedin.md',
      'draft-substack.md',
    ];
    for (const name of expected) {
      expect(SKILL_FILE_NAMES).toContain(name);
    }
  });

  it('has 11 entries', () => {
    expect(SKILL_FILE_NAMES).toHaveLength(11);
  });

  it('has no duplicate entries', () => {
    const unique = new Set(SKILL_FILE_NAMES);
    expect(unique.size).toBe(SKILL_FILE_NAMES.length);
  });
});
