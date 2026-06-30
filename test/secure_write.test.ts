// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect } from 'vitest';
import { existsSync, statSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { writeSecureJson } from '../src/fs/secure-write.js';

describe('writeSecureJson', () => {
  it('writes the correct JSON content to the target file', () => {
    const filePath = join(tmpdir(), `postlane-sw-content-${Date.now()}.json`);
    try {
      writeSecureJson(filePath, { version: 1, repos: [] });
      const content: unknown = JSON.parse(readFileSync(filePath, 'utf-8'));
      expect(content).toEqual({ version: 1, repos: [] });
    } finally {
      if (existsSync(filePath)) rmSync(filePath);
    }
  });

  it('writes the file with mode 0600', () => {
    const filePath = join(tmpdir(), `postlane-sw-perm-${Date.now()}.json`);
    try {
      writeSecureJson(filePath, { version: 1 });
      const stat = statSync(filePath);
      expect(stat.mode & 0o777).toBe(0o600);
    } finally {
      if (existsSync(filePath)) rmSync(filePath);
    }
  });

  it('leaves no .tmp file behind on success (atomic write)', () => {
    const filePath = join(tmpdir(), `postlane-sw-atomic-${Date.now()}.json`);
    try {
      writeSecureJson(filePath, { version: 1 });
      expect(existsSync(`${filePath}.tmp`)).toBe(false);
      expect(existsSync(filePath)).toBe(true);
    } finally {
      if (existsSync(filePath)) rmSync(filePath);
    }
  });
});
