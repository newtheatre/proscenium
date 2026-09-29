# 0109: The end-to-end suites run on every pull request, and gate once they are green

- Status: Accepted (IT Manager, 29 September 2026)
- Date: 2026-09-29
- Amends: 0029 ("the second runs nightly and on demand")

## Context

0029 split the suites into `bun run test`, which gates every merge, and `test:e2e`, which was to
run nightly and on demand from `.github/workflows/e2e.yml`. That never happened. GitHub registers
a `schedule:` trigger only from the default branch, still `main` until cutover, and
`workflow_dispatch` cannot reach a file that is not there either. So the suites had never run on a
runner. When they first did, most of them failed: two harness defects, fixed with this record,
and a large drift between the fixtures and the product, such as officers with no authenticator
and shift-eligibility keys never set.

## Decision

**`e2e.yml` runs on every pull request into `unified/main`**, since a `pull_request` run reads
the pull request's own workflow file, and keeps `workflow_dispatch` and the schedule, which
registers at cutover. The suites run in ten slices (`E2E_SLICE`), one runner each, and each run
makes its own throwaway keys.

**The trigger is held until the suites are green.** The pull request that adds it stays a draft,
and its own run measures the drift. The drift is fixed in pull requests into `unified/main`, one
per area: test changes only, a real product bug getting an issue and a skip that cites it, and no
weakened assertion. When the draft's run is green it is merged, and the check becomes a required
one.

## Consequences

- Until then a browser regression is caught only by whoever runs the suites by hand.
- Every pull request pays ten runners for up to half an hour each once this lands. Cancelling an
  older run on a newer push keeps that to one run per pull request at a time.
- `CONTRIBUTING.md`, the README and the architecture notes say "on every pull request" rather
  than "nightly", in the pull request that makes it true.

## Options considered

- **Merge the trigger now, not required.** Rejected. Every pull request would show hundreds of
  known failures, and a new one would hide among them.
- **A copy of `e2e.yml` on `main`** (#825), so the schedule registers now. It runs the suites
  once a night rather than on the change that breaks them, and stays open until cutover.
