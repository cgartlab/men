## What

<!-- What does this PR change? Keep it to one or two sentences. -->

## Why

<!-- Why is this change needed? Link the issue with "Closes #123". -->

## How to test

<!-- How can a reviewer verify the change locally? -->

- [ ] `npm run verify` passes
- [ ] `node scripts/release.mjs --dry-run` is clean
- [ ] Relevant `scripts/*.mjs` pass `node --check`

## Checklist

- [ ] Commits follow Conventional Commits (`feat/fix/docs/refactor/test/chore/perf/ci(scope): ...`)
- [ ] No new third-party dependencies added to zero-dep scripts
- [ ] `AGENTS.md` and `README.md` updated if behavior changed
- [ ] All 7 red-line rules for agent definitions preserved (if edited)
