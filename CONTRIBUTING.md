# Contributing to @postlane/cli

## Branching model

```
feature branch  →  beta  →  main
```

- All new work targets `beta`, not `main`.
- `beta` is the integration branch. The `smoke.yml` workflow runs on every push to `beta`.
- `beta` → `main` is the stable promotion step. It creates a GitHub Release and updates `@postlane/cli@latest` on npm.
- Direct pushes to `beta` and `main` are blocked. All changes require a pull request.

## Commit conventions

semantic-release reads conventional commits to determine the version bump:

| Prefix | Effect |
|--------|--------|
| `fix:` | Patch bump (0.0.x) |
| `feat:` | Minor bump (0.x.0) |
| `feat:` + `BREAKING CHANGE:` footer | Major bump (x.0.0) |
| `chore:`, `docs:`, `test:`, `ci:`, `style:`, `refactor:` | No release |

Scopes are optional but encouraged: `feat(init):`, `fix(doctor):`, `chore(ci):`.

Do not bump `package.json` manually. semantic-release owns that field.

## CI tokens — rotation schedule

`CI_GITHUB_SESSION_TOKEN` and `CI_GITLAB_SESSION_TOKEN` are repository secrets used by the smoke test workflow. Both must be rotated every 90 days.

**If smoke tests fail on a codebase that has not changed**, check the raw CI log for `401` or `403` errors before investigating the code. Token expiry is the most common cause of phantom smoke failures.

### Rotation steps

1. Generate a new Postlane session token for the CI test user (sign in with the CI account via the desktop app; the token is written to `~/.postlane/session.token`).
2. In the `postlane/cli` repository settings, go to **Settings → Secrets and variables → Actions**.
3. Update `CI_GITHUB_SESSION_TOKEN` and `CI_GITLAB_SESSION_TOKEN` with the new values.
4. Push a trivial commit to `beta` to confirm the next `smoke.yml` run passes.

Set a recurring calendar reminder 90 days from the last rotation date.

## Beta channel

Install the beta channel to get fixes and features before the stable release:

```bash
npx @postlane/cli@beta init
```

Revert to stable:

```bash
npx @postlane/cli@latest init
```

Report beta-specific issues at <https://github.com/postlane/cli/issues> with the `beta` label.

## Rollback procedure

### Bad beta publish

```bash
npm dist-tag add @postlane/cli@{previous-beta-version} beta
npm info @postlane/cli dist-tags   # confirm rollback
```

### Bad stable publish

```bash
npm dist-tag add @postlane/cli@{previous-version} latest
npm info @postlane/cli dist-tags   # confirm rollback
```

## Staging escalation path

If a regression is found on staging:

1. File an issue tagged `staging-regression` with the URL, error, and steps to reproduce.
2. Hold the `beta` → `main` PR until the issue is resolved or explicitly accepted.
3. If staging is broken and the root cause is unclear, revert the last merge to `beta` rather than shipping a fix under pressure.

Expected turnaround for staging regressions: same business day for critical issues, next business day for non-critical.
