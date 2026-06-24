// SPDX-License-Identifier: BUSL-1.1
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const readme = readFileSync(join(__dirname, '../README.md'), 'utf8');

describe('README — beta channel documentation (23.5.7)', () => {
  it('has a beta channel section heading', () => {
    expect(readme).toMatch(/##\s+beta channel/i);
  });

  it('documents the beta opt-in command', () => {
    expect(readme).toContain('npx @postlane/cli@beta init');
  });

  it('documents how to revert to stable', () => {
    expect(readme).toContain('npx @postlane/cli@latest init');
  });

  it('states who the beta channel is for', () => {
    // Must explain the audience — fixes/features ahead of stable
    expect(readme).toMatch(/fix(es)?|feature(s)?|ahead of stable/i);
  });

  it('links to the GitHub issues page for beta reports', () => {
    expect(readme).toMatch(/github\.com\/postlane\/cli\/issues/);
  });

  it('includes the beta label for issue reporting', () => {
    expect(readme).toMatch(/["`]beta["`]|beta.*label|label.*beta/i);
  });
});
