// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect } from 'vitest';
import { isValidPort, KNOWN_INSTALL_PATHS } from '../src/app/health.js';

describe('isValidPort', () => {
  it('accepts valid port strings', () => {
    expect(isValidPort('1')).toBe(true);
    expect(isValidPort('80')).toBe(true);
    expect(isValidPort('47312')).toBe(true);
    expect(isValidPort('65535')).toBe(true);
  });

  it('rejects port 0', () => {
    expect(isValidPort('0')).toBe(false);
  });

  it('rejects port above 65535', () => {
    expect(isValidPort('65536')).toBe(false);
    expect(isValidPort('99999')).toBe(false);
  });

  it('rejects non-numeric strings', () => {
    expect(isValidPort('')).toBe(false);
    expect(isValidPort('abc')).toBe(false);
    expect(isValidPort('9999; touch /tmp/x')).toBe(false);
    expect(isValidPort('$(id)')).toBe(false);
  });

  it('rejects floats', () => {
    expect(isValidPort('80.5')).toBe(false);
    expect(isValidPort('1.0')).toBe(false);
  });
});

describe('KNOWN_INSTALL_PATHS', () => {
  it('has entries for darwin, linux, and win32', () => {
    expect('darwin' in KNOWN_INSTALL_PATHS).toBe(true);
    expect('linux' in KNOWN_INSTALL_PATHS).toBe(true);
    expect('win32' in KNOWN_INSTALL_PATHS).toBe(true);
  });

  it('each platform has at least one path', () => {
    for (const paths of Object.values(KNOWN_INSTALL_PATHS)) {
      expect(Array.isArray(paths)).toBe(true);
      expect(paths.length).toBeGreaterThan(0);
    }
  });

  it('darwin paths reference Postlane.app', () => {
    for (const p of KNOWN_INSTALL_PATHS.darwin) {
      expect(p).toMatch(/Postlane\.app/);
    }
  });
});

describe('isAppHealthy', () => {
  it('is exported from src/app/health', async () => {
    const mod = await import('../src/app/health.js');
    expect(typeof mod.isAppHealthy).toBe('function');
  });

  it('returns false when fetch throws (app not running)', async () => {
    const { isAppHealthy } = await import('../src/app/health.js');
    // Port 19999 is almost certainly not running a Postlane instance
    const result = await isAppHealthy('19999');
    expect(result).toBe(false);
  });

  it('returns false for invalid port', async () => {
    const { isAppHealthy } = await import('../src/app/health.js');
    const result = await isAppHealthy('not-a-port');
    expect(result).toBe(false);
  });
});
