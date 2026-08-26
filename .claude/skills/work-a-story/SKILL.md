---
name: work-a-story
description: Use when implementing any backlog story from docs/backlog/, or when asked to build a feature, fix behaviour, or make any product change in this repository. Enforces the spec-and-test-driven order and the definition-of-done.
---

# Working a backlog story

The repository's one order of work: spec, then failing tests, then implementation. This skill
walks a story from pick-up to merge-ready.

## 1. Establish the spec

1. Find the story in `docs/backlog/<module>.md` by its id (for example `D-108`). If the change
   has no story, stop and write one first (or a decision record for architectural change);
   a change with no home in either does not merge.
2. Read the story's phase, dependencies and every acceptance criterion. A dependency that is
   not yet built means this story is not next; say so rather than building around it.
3. Check `docs/decisions/` for records the story cites. Cite them in code comments where a
   constraint needs stating; never re-argue an accepted record in code review.
4. If an acceptance criterion is ambiguous, resolve it against the decision records and the
   story's Source line, and record the interpretation in the pull request description.

## 2. Write the failing tests

1. Translate each acceptance criterion into at least one test before any implementation:
   unit tests for pure logic, integration tests against a real test database for routes and
   invariants.
2. A criterion claiming concurrency safety ("race-safe", "at-most-once", "exactly one
   winner") gets a racing test that fires concurrent requests, never a comment.
3. Run the suite and confirm the new tests fail for the right reason.
4. If the story touches money, capacity, register marking, expiry or erasure, check the named
   regression suite (story K-121) for cases to extend.

## 3. Implement

1. Follow the invariants in `CLAUDE.md`: batch-only atomicity, conditional writes for
   contended claims, integer pence, Europe/London dates, append-only tables untouched by
   UPDATE or DELETE, column allow-lists on customer-facing responses, Zod on every input.
2. Keep the change reviewable in twenty minutes; a bigger slice is two stories or two pull
   requests.

## 4. Finish

1. All tests pass, including lint, typecheck and the comment check.
2. Documentation that describes the changed behaviour updates in the same pull request,
   including any policy page tokens and the API reference.
3. The pull request description names the story id, quotes which acceptance criteria the
   tests pin, and records any interpretation made in step 1.4.
4. Never add attribution trailers naming a tool; work is attributed to the person submitting.
