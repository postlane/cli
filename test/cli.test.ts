// SPDX-License-Identifier: BUSL-1.1
import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';

describe('postlane CLI placeholder', () => {
  it('should print "Postlane CLI coming soon." to stdout', () => {
    const output = execSync('node dist/index.js', { encoding: 'utf-8' });
    expect(output.trim()).toBe('Postlane CLI coming soon.');
  });

  it('should exit with code 0', () => {
    const result = execSync('node dist/index.js; echo $?', { encoding: 'utf-8' });
    const exitCode = result.trim().split('\n').pop();
    expect(exitCode).toBe('0');
  });
});
