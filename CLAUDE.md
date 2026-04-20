# CLAUDE.md — postlane/cli

## Non-negotiable rules

**No `Co-Authored-By: Claude` or any AI attribution in commits or PRs.** Never
add `Co-Authored-By:`, "Generated with Claude Code", or any AI tool attribution
to a commit message or PR description.

**Never** `git commit --no-verify`. **Never** `git push --force`.

---

## Language — TypeScript, Node ≥18

The CLI runs on the user's machine in environments you cannot predict. Write
code that assumes the environment is hostile.

### Error messages are user-facing

Every error must say: (1) what went wrong specifically, (2) where, (3) what to
do next. Never log raw `Error` objects — log `error.message` only.

```typescript
// BAD
console.error('Setup failed:', error);

// GOOD
console.error('Setup failed:', error instanceof Error ? error.message : String(error));
```

### Type safety

- `"strict": true` — no `any`, no type assertions, no `@ts-ignore`

### Never write credentials to disk

The CLI asks for API keys and passes them to the app via HTTP or instructs the
user to enter them in Settings. Never write API keys to any file.

### Always validate the target is a Git repo first

Before writing any files, confirm `.git/` exists at the repo root.

### `repos.json` writes must use the correct schema

Always construct: `{ version: 1, repos: [{ id, name, path, active, added_at }] }`.

---

## Security — never violate

1. No credentials on disk — ever
2. Validate the target is a git repo before any file writes
3. All URLs must start with `https://`
4. No analytics SDK, no telemetry — zero

---

## Testing (TDD — non-negotiable)

1. Write failing test → confirm RED
2. Write minimum code to pass → confirm GREEN
3. Refactor → commit

- Vitest — all pass (100% on init, register, doctor paths)
- TypeScript compilation — zero errors
- `npm audit` — no high/critical

Tests must use `tmp` directories and clean up. Never write to real
`~/.postlane/` directories.

---

## Code limits

| Metric | Limit |
|--------|-------|
| Lines per file | 400 |
| Lines per function | 60 |
| Nesting depth | 3 |

No ESLint disable comments — fix the code.
