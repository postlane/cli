// SPDX-License-Identifier: BUSL-1.1
import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';

describe('postlane CLI', () => {
  it('should show help when run without arguments', () => {
    try {
      execSync('node dist/index.js', { encoding: 'utf-8' });
    } catch (error: any) {
      // Commander exits with 1 when showing help
      const output = error.stderr || error.stdout;
      expect(output).toContain('Postlane CLI - Social media post scheduling');
      expect(output).toContain('Commands:');
      expect(output).toContain('init');
      expect(output).toContain('register');
    }
  });

  it('should show version with --version flag', () => {
    const output = execSync('node dist/index.js --version', { encoding: 'utf-8' });
    expect(output.trim()).toBe('0.0.1');
  });
});
