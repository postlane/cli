// SPDX-License-Identifier: BUSL-1.1
//
// Structural tests ensuring all CLI workflow files use consistent, SHA-pinned action references.
// Supply chain attacks via redirected floating tags are blocked by pinning to exact commit SHAs.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WORKFLOWS_DIR = join(__dirname, '..', '..', '.github', 'workflows');

function readWorkflows(): Array<{ name: string; content: string }> {
  return readdirSync(WORKFLOWS_DIR)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map((f) => ({ name: f, content: readFileSync(join(WORKFLOWS_DIR, f), 'utf-8') }));
}

function extractUsesLines(content: string): string[] {
  return content.split('\n').filter((l) => /^\s+uses:\s/.test(l));
}

function extractActionRef(line: string): string {
  return line.match(/uses:\s+(\S+)/)?.[1] ?? '';
}

describe('CLI workflow files — action SHA consistency', () => {
  it('no workflow uses a floating version tag (e.g. @v4, @v6)', () => {
    const workflows = readWorkflows();
    for (const { name, content } of workflows) {
      for (const line of extractUsesLines(content)) {
        const ref = extractActionRef(line);
        expect(ref, `Floating tag in ${name}: ${line.trim()}`).not.toMatch(/@v\d+(\.|$)/);
        expect(ref, `Floating @stable in ${name}: ${line.trim()}`).not.toMatch(/@stable$/);
        expect(ref, `Floating @main in ${name}: ${line.trim()}`).not.toMatch(/@main$/);
      }
    }
  });

  it('all workflows use the same SHA for actions/checkout', () => {
    const workflows = readWorkflows();
    const checkoutRefs = new Set<string>();
    for (const { content } of workflows) {
      for (const line of extractUsesLines(content)) {
        const ref = extractActionRef(line);
        if (ref.startsWith('actions/checkout@')) {
          checkoutRefs.add(ref);
        }
      }
    }
    expect(checkoutRefs.size, `Multiple checkout SHAs found: ${[...checkoutRefs].join(', ')}`).toBe(1);
  });

  it('all workflows use the same SHA for actions/setup-node', () => {
    const workflows = readWorkflows();
    const setupNodeRefs = new Set<string>();
    for (const { content } of workflows) {
      for (const line of extractUsesLines(content)) {
        const ref = extractActionRef(line);
        if (ref.startsWith('actions/setup-node@')) {
          setupNodeRefs.add(ref);
        }
      }
    }
    expect(setupNodeRefs.size, `Multiple setup-node SHAs found: ${[...setupNodeRefs].join(', ')}`).toBe(1);
  });

  it('release.yml has a post-publish smoke step that installs and invokes the published package', () => {
    // The semantic-release back-commit uses [skip ci] — the published artefact is never
    // smoke-tested by the main CI run. A post-publish step validates the npm artefact directly.
    const releasePath = join(WORKFLOWS_DIR, 'release.yml');
    const content = readFileSync(releasePath, 'utf-8');
    const releaseIndex = content.indexOf('npx semantic-release');
    const smokeIndex = content.indexOf('@postlane/cli', releaseIndex);
    expect(releaseIndex, 'npx semantic-release step not found').toBeGreaterThan(-1);
    expect(smokeIndex, 'post-publish smoke step not found after Release step').toBeGreaterThan(releaseIndex);
  });

  it('release.yml enables npm provenance attestation via npm_config_provenance', () => {
    const releasePath = join(WORKFLOWS_DIR, 'release.yml');
    expect(existsSync(releasePath)).toBe(true);
    const content = readFileSync(releasePath, 'utf-8');
    // npm reads npm_config_provenance=true and passes --provenance to npm publish.
    // @semantic-release/npm v13 does not have a native provenance option; env var is the correct mechanism.
    expect(content).toContain("npm_config_provenance: 'true'");
  });

  it('ci.yml includes macos-latest in the OS matrix (CLI targets developer macOS machines)', () => {
    const ciPath = join(WORKFLOWS_DIR, 'ci.yml');
    const content = readFileSync(ciPath, 'utf-8');
    expect(content).toContain('macos-latest');
  });

  it('comments reference v4, not v6 (v6 does not exist)', () => {
    const workflows = readWorkflows();
    for (const { name, content } of workflows) {
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.trim().startsWith('#') && (line.includes('checkout@v6') || line.includes('setup-node@v6'))) {
          expect.fail(`${name} references non-existent @v6 in comment: ${line.trim()}`);
        }
      }
    }
  });
});
