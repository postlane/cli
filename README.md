# @postlane/cli

CLI for [PostLane](https://postlane.dev) — connect a Git repository to PostLane so commits can trigger social media post drafts.

## Quick start

```bash
npx @postlane/cli init
```

## Commands

| Command | Description |
|---------|-------------|
| `init` | Connect the current repository to PostLane |
| `register` | Re-register an already-connected repository with the desktop app |
| `doctor` | Check that the repository connection is healthy |

## Beta channel

The beta channel receives fixes and features ahead of the stable release. Use it if you want early access or are helping test a specific fix.

```bash
npx @postlane/cli@beta init
```

Revert to stable at any time:

```bash
npx @postlane/cli@latest init
```

Report beta-specific issues at <https://github.com/postlane/cli/issues> with the `beta` label.
