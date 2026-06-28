# CI Token Rotation Schedule

Tokens rotated on this date expire 90 days later.
The `token-rotation-reminder.yml` workflow checks weekly and opens a GitHub issue
when expiry is within 14 days.

## Last rotation

**Date:** 2026-06-24

**Tokens rotated:**
- `CI_GITHUB_SESSION_TOKEN` — Postlane session token for `postlane-ci-test` GitHub org
- `CI_GITLAB_SESSION_TOKEN` — Postlane session token for `postlane-ci-test` GitLab group

**Next rotation due:** 2026-09-22

## Rotation procedure

See `CONTRIBUTING.md` → "Token rotation procedure" for full steps.
After rotating, update the **Last rotation** date above and commit to `main`.
