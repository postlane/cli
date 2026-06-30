// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readPortFile } from '../src/app/session.js';

describe('readPortFile', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'postlane-session-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns the port number when the file contains a valid port', () => {
    writeFileSync(join(dir, 'port'), '47312');
    expect(readPortFile(dir)).toBe(47312);
  });

  it('returns null when the port file does not exist', () => {
    expect(readPortFile(dir)).toBeNull();
  });

  it('returns null when the port is 0', () => {
    writeFileSync(join(dir, 'port'), '0');
    expect(readPortFile(dir)).toBeNull();
  });

  it('returns null when the port exceeds 65535', () => {
    writeFileSync(join(dir, 'port'), '65536');
    expect(readPortFile(dir)).toBeNull();
  });

  it('returns null for non-numeric content', () => {
    writeFileSync(join(dir, 'port'), 'not-a-port');
    expect(readPortFile(dir)).toBeNull();
  });

  it('trims whitespace from the port file content', () => {
    writeFileSync(join(dir, 'port'), '  8080\n');
    expect(readPortFile(dir)).toBe(8080);
  });

  it('returns 1 for the minimum valid port', () => {
    writeFileSync(join(dir, 'port'), '1');
    expect(readPortFile(dir)).toBe(1);
  });

  it('returns 65535 for the maximum valid port', () => {
    writeFileSync(join(dir, 'port'), '65535');
    expect(readPortFile(dir)).toBe(65535);
  });

  it('returns null without throwing when port file is deleted after existsSync check (TOCTOU)', async () => {
    vi.resetModules();

    vi.doMock('fs', async () => {
      const actual = await vi.importActual<typeof import('fs')>('fs');
      return {
        ...actual,
        existsSync: () => true,
        readFileSync: () => {
          const err = Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' });
          throw err;
        },
      };
    });

    const { readPortFile: freshReadPortFile } = await import('../src/app/session.js');

    let result: number | null = null;
    let threw = false;
    try {
      result = freshReadPortFile('/any/dir');
    } catch {
      threw = true;
    }

    vi.doUnmock('fs');
    vi.resetModules();

    expect(threw).toBe(false);
    expect(result).toBeNull();
  });
});
