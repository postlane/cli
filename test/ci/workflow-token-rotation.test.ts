// SPDX-License-Identifier: BUSL-1.1
//
// Structural tests for the token rotation reminder workflow.
// These run on every `npx vitest run` — no CI_SMOKE_TESTS guard needed.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..', '..');

describe('.github/workflows/token-rotation-reminder.yml', () => {
  const workflowPath = join(REPO_ROOT, '.github', 'workflows', 'token-rotation-reminder.yml');

  it('exists', () => {
    expect(existsSync(workflowPath)).toBe(true);
  });

  it('has a weekly schedule trigger', () => {
    const content = readFileSync(workflowPath, 'utf-8');
    expect(content).toContain('schedule:');
    expect(content).toContain('cron:');
  });

  it('has workflow_dispatch for manual triggering', () => {
    const content = readFileSync(workflowPath, 'utf-8');
    expect(content).toContain('workflow_dispatch');
  });

  it('has issues: write permission', () => {
    const content = readFileSync(workflowPath, 'utf-8');
    expect(content).toContain('issues: write');
  });

  it('opens a GitHub issue using gh CLI', () => {
    const content = readFileSync(workflowPath, 'utf-8');
    expect(content).toContain('gh issue create');
  });

  it('references docs/token-rotation.md as the source of rotation dates', () => {
    const content = readFileSync(workflowPath, 'utf-8');
    expect(content).toContain('docs/token-rotation.md');
  });

  it('checks within 14 days of expiry (not on exact expiry)', () => {
    const content = readFileSync(workflowPath, 'utf-8');
    expect(content).toContain('14');
  });

  it('all action references are SHA-pinned', () => {
    const content = readFileSync(workflowPath, 'utf-8');
    const usesLines = content.split('\n').filter((l) => /^\s+uses:\s/.test(l));
    for (const line of usesLines) {
      const ref = line.match(/uses:\s+(\S+)/)?.[1] ?? '';
      expect(ref, `floating tag in: ${line.trim()}`).not.toMatch(/@v\d+(\.|$)/);
      expect(ref, `floating @stable in: ${line.trim()}`).not.toMatch(/@stable$/);
      expect(ref, `floating @main in: ${line.trim()}`).not.toMatch(/@main$/);
    }
  });
});

describe('docs/token-rotation.md', () => {
  const schedulePath = join(REPO_ROOT, 'docs', 'token-rotation.md');

  it('exists', () => {
    expect(existsSync(schedulePath)).toBe(true);
  });

  it('contains a last-rotated date in YYYY-MM-DD format', () => {
    const content = readFileSync(schedulePath, 'utf-8');
    expect(content).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('rotation date is not in the future', () => {
    const content = readFileSync(schedulePath, 'utf-8');
    const match = content.match(/(\d{4}-\d{2}-\d{2})/);
    if (!match) throw new Error('No YYYY-MM-DD date found in docs/token-rotation.md');
    const rotationDate = new Date(match[1]);
    expect(rotationDate.getTime()).toBeLessThanOrEqual(Date.now());
  });
});
