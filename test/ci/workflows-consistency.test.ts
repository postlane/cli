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

  it('release.yml smoke check does not sleep unconditionally on the last attempt', () => {
    const releasePath = join(WORKFLOWS_DIR, 'release.yml');
    const content = readFileSync(releasePath, 'utf-8');
    const smokeSection = content.slice(content.indexOf('Post-publish smoke check'));
    // sleep must be guarded so it does not run after the final failed attempt
    expect(smokeSection, 'sleep must be guarded with an iteration check').toMatch(
      /\[\s*"\$i"\s*-lt\s+5\s*\]\s*&&\s*sleep|if\s*\[\s*"\$i"\s*-lt\s+5/
    );
  });

  it('release.yml smoke check uses retry logic, not a bare sleep', () => {
    // npm CDN propagation takes 30–120 seconds. A bare `sleep 10` resolves stale
    // cached versions that report the previous release as the new one. The smoke check
    // must retry with adequate delay between attempts so a genuinely broken publish
    // is caught rather than masked by a CDN cache hit on the previous release.
    const releasePath = join(WORKFLOWS_DIR, 'release.yml');
    const content = readFileSync(releasePath, 'utf-8');
    const smokeSection = content.slice(content.indexOf('Post-publish smoke check'));
    expect(smokeSection, 'smoke check must have a retry loop (for/while)').toMatch(/\bfor\b|\bwhile\b/);
    // Check command lines only (not comments) for a bare `sleep 10`
    const smokeCommandLines = smokeSection.split('\n').filter((l) => !l.trim().startsWith('#'));
    expect(smokeCommandLines.join('\n'), 'smoke check command must not contain bare sleep 10').not.toContain('sleep 10');
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

  it('ci.yml license-checker allowlist does not permit copyleft licenses (LGPL, MPL)', () => {
    // LGPL-3.0-or-later requires end users to be able to replace and relink the library —
    // impossible in a statically-bundled npm CLI. MPL-2.0 requires disclosure of modified
    // source files. Neither obligation can be satisfied by the current bundled distribution
    // format. Neither license is used by any current production dependency; the allowlist
    // must not open the door for future accidental inclusion.
    const ciPath = join(WORKFLOWS_DIR, 'ci.yml');
    const content = readFileSync(ciPath, 'utf-8');
    const licenseCheckLine = content.split('\n').find((l) => l.includes('license-checker') && l.includes('onlyAllow'));
    expect(licenseCheckLine, 'license-checker --onlyAllow line not found in ci.yml').toBeTruthy();
    expect(licenseCheckLine, 'LGPL must not be in the production allowlist').not.toContain('LGPL');
    expect(licenseCheckLine, 'MPL-2.0 must not be in the production allowlist').not.toContain('MPL-2.0');
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
