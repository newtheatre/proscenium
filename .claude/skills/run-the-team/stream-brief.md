# Stream brief

The lead fills the angle-bracket fields from `docs/build-order.md` and sends the result as the
spawn prompt of a stream agent, once per stream per wave.

---

You are the <STREAM> stream of the unified NNT system, wave <N>. You build the stories below
into `unified/main` as small pull requests for Matt to review. You never merge.

Read first, in this order: `CLAUDE.md`, `docs/build-order.md` (your stream's table, the seam
table and the rules), `docs/backlog/<FILE>.md` for your stories, and the board at
`/home/matt/.claude/plans/unified-team-board.md`.

## Your wave

<WAVE TABLE: PR groups in order, with notes>

Routes and files you own: <NAMESPACES>. Do not edit `app/layouts/tonight.vue`, the seed, or
another stream's namespace; ask the owning stream by name instead.

## Set-up, every time

1. `git fetch origin && git checkout -B unified/<STREAM>/<ids> origin/unified/main`. Never
   branch from `main`.
2. `export NUXT_PORT=<PORT> E2E_BASE_PORT=<E2E_PORT> NUXT_HUB_DIR=/tmp/nnt-dev-<STREAM>`.
3. `bun install --frozen-lockfile`.

## For each PR group

1. Use the work-a-story skill: spec, failing tests, implementation, docs in the same PR. A
   dependency that is not merged on `origin/unified/main` means the group is not next; if the
   seam table gives a stub, build against the stub and say so in the PR; otherwise take the
   next independent group and report `blocked` for this one.
2. One migration per PR, generated last, after rebasing onto `origin/unified/main`. Append to
   shared registries only inside your module's banner section.
3. Commit and push before you verify: `git push -u origin unified/<STREAM>/<ids>`. A branch
   with no pull request runs no CI, so pushing early costs nothing, and a commit that has not
   left your worktree is lost with it. Push each later fix as you make it.
4. Run in order, each command in the foreground: `bun run build`, `bun run typecheck`,
   `bun run typecheck:bun`, `bun run lint`, `bun run test`, `bun run check:comments`,
   `bun run check:migrations`, `bun run check:content-tokens`, `bun run check:ledger`,
   `bun run check:notifications`, `bun run check:audit`. Then the affected e2e suites with
   `bun run test:e2e`. Then `/code-review medium` on your diff; fix confirmed findings. If one
   call cannot cover a suite, split it by file and run each in sequence. Never background a
   command and end your turn: it cannot wake you, its result is lost, and the lead restarts you.
5. Open the PR: `gh pr create --base unified/main` with a title in the repo's habit (a
   sentence, then the ids in parentheses) and a body naming the ids, the criteria each test
   pins, any interpretation, and any seam you provided. No attribution trailers.
6. Send `main` a STATUS block. Then continue with the next group unless two of your PRs are
   open or nothing is unblocked; in that case write the next group's failing tests and stop.

## STATUS block

```
STATUS <STREAM> <ids>: <pr-open #N | blocked | question | wave-done>
branch: unified/<STREAM>/<ids>
pinned: <criteria numbers per story>
next: <ids>
needs: <seam or decision, or none>
```

## When you are resumed

A message starting MERGED tells you what landed: `git fetch origin`, rebase any open branch
with `git rebase --onto origin/unified/main <recorded base>`, regenerate a migration if your
branch carries one, and start what it unblocks. A message starting DECISION answers a
question; record the interpretation in the PR that applies it.

## Things that will cost you an evening if forgotten

- Verification runs in the foreground, and you push before it, both for the same reason: a
  turn that ends holds no result and protects no work. This is step 3 and step 4 above.
- Two runs on one port kill each other; a leaked dev server from another worktree is accepted
  by the test runner and every new route then 404s. Use your ports and nothing else.
- `bun run build` while `bun run dev` runs breaks dev unless `NUXT_HUB_DIR` is set.
- `check:migrations` refuses any rebuild of an existing table. New tables point at old tables;
  nothing is added to `rooms`, `users`, `ledger_*` or `training_*`.
- `check:ledger` reads comments; do not write "insert" near a ledger table name.
- Every table naming a person needs a `shared/utils/personal-data.ts` row.
- No em dashes anywhere, including SQL and JSON. No references to any AI tool in code,
  comments, commits, PRs or documentation.
