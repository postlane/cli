// SPDX-License-Identifier: BUSL-1.1
//
// Structural tests for CLI GitHub Actions workflow files.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WORKFLOWS_DIR = join(__dirname, '..', '.github', 'workflows');

function readWorkflow(name: string): string {
  return readFileSync(join(WORKFLOWS_DIR, name), 'utf-8');
}

function workflowNames(): string[] {
  return readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
}

describe('cli workflow files — branch trigger coverage', () => {
  it('ci.yml triggers on push and PR to the beta branch', () => {
    const content = readWorkflow('ci.yml');
    const lines = content.split('\n');
    const pushIdx = lines.findIndex((l) => l.trim() === 'push:');
    const prIdx = lines.findIndex((l) => l.trim() === 'pull_request:');
    expect(pushIdx, 'push: trigger not found in ci.yml').toBeGreaterThan(-1);
    expect(prIdx, 'pull_request: trigger not found in ci.yml').toBeGreaterThan(-1);
    // Find branches under push:
    const pushBranchLine = lines.slice(pushIdx, pushIdx + 5).find((l) => l.includes('beta'));
    expect(pushBranchLine, 'beta not in push branches in ci.yml — beta commits will skip CI').toBeDefined();
    // Find branches under pull_request:
    const prBranchLine = lines.slice(prIdx, prIdx + 5).find((l) => l.includes('beta'));
    expect(prBranchLine, 'beta not in pull_request branches in ci.yml — beta PRs will skip CI').toBeDefined();
  });
});

describe('cli workflow files — job timeouts', () => {
  it('smoke.yml job has a timeout-minutes to prevent indefinite hangs on live network calls', () => {
    const content = readWorkflow('smoke.yml');
    expect(
      content,
      'smoke.yml has no timeout-minutes — live network calls can hang the runner indefinitely',
    ).toContain('timeout-minutes:');
  });
});

describe('cli workflow files — no floating version tags', () => {
  it('no workflow uses a floating version tag (@v4, @stable, @main)', () => {
    for (const name of workflowNames()) {
      const content = readWorkflow(name);
      for (const line of content.split('\n').filter((l) => /^\s+uses:\s/.test(l))) {
        const ref = line.match(/uses:\s+(\S+)/)?.[1] ?? '';
        expect(ref, `Floating tag in ${name}: ${line.trim()}`).not.toMatch(/@v\d+(\.|$)/);
        expect(ref, `Floating @stable in ${name}: ${line.trim()}`).not.toMatch(/@stable$/);
        expect(ref, `Floating @main in ${name}: ${line.trim()}`).not.toMatch(/@main$/);
      }
    }
  });
});
