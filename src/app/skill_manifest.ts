// SPDX-License-Identifier: BUSL-1.1

/// Canonical list of Postlane skill file names (base v1 + v1.1).
/// doctor.ts uses this to check for presence; config_writer.ts uses the
/// stem (without .md) to copy skill files.
export const SKILL_FILE_NAMES: readonly string[] = [
  'draft-post.md',
  'register-repo.md',
  'draft-changelog.md',
  'draft-show-hn.md',
  'draft-product-hunt.md',
  'redraft-post.md',
  'draft-x.md',
  'draft-bluesky.md',
  'draft-mastodon.md',
  'draft-linkedin.md',
  'draft-substack.md',
] as const;
