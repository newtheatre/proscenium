---
name: run-the-team
description: Use when asked to run, resume or check on the parallel build of the MVP backlog as a team of stream agents, or when a stream reports a merge, a blocker or a question.
---

# Running the team

You are the lead. You write no product code. You sequence Wave 0, spawn and resume the four
stream agents, keep the board, poll merges, relay seams, update the tracker and batch questions
for Matt. The order of work, the waves, the seams and the rules are in `docs/build-order.md`;
read it in full before anything else, and treat it as the spec for this skill. The per-stream
brief you fill in is `stream-brief.md` beside this file.

## 1. Orientation

1. `git fetch origin` and read `git log --oneline origin/unified/main | head -40`.
2. Read the board at `/home/matt/.claude/plans/unified-team-board.md`. If it does not exist,
   create it from the template in section 6 with every stream at "not started".
3. `gh pr list --base unified/main --state open` and `--state merged --limit 40`. Reconcile the
   board: a story whose PR merged is done; a PR open is in review.
4. `ListAgents`. A stream agent that is still alive is resumed with a message, never respawned.

## 2. Wave 0

Wave 0 is serial. For each contract in `docs/build-order.md` in its merge order, spawn one sonnet agent
(`subagent_type: general-purpose`, `isolation: worktree`, `run_in_background: true`, named after
the contract) with the stream brief for the owning stream and the single instruction to deliver
that contract as one PR. Wait for its STATUS. Do not start the next contract until Matt has
merged the previous one, except that E-110, the ledger contract and K-102 touch disjoint files
and may be open together. The venue decision record (a venue is a row; an optional `room_id`
whose only effect is blackouts) and the bypass decision record (officer bypass carries, audited
and flagged) are written in the programme schema PR and the E-111 stub PR respectively, using
the new-decision skill.

When contract (g) merges, Wave 0 is done: update the board and fan out.

## 3. Fan out

Spawn four sonnet agents in one message, named `box-office`, `show-night`, `bar` and `platform`, each
with `isolation: worktree`, `run_in_background: true`, and the brief from `stream-brief.md`
filled in with that stream's wave 1 table, ports and route namespaces. The brief tells the
agent to work the wave's PR groups in order, to stop when the wave is exhausted, a dependency
is unmerged or two PRs are open, and to report with the STATUS block.

## 4. The loop

Start `/loop 20m` with this instruction: "Run the run-the-team merge check." On each tick:

1. `git fetch origin`; list PRs merged into `unified/main` since the board's last check.
2. For each: mark its stories done on the board; close their issues with a comment linking the
   PR (project-tracker skill); find every stream whose next PR group it unblocks (the seam
   table and the wave tables in `docs/build-order.md`) and send that stream a message naming
   the merged ids and what it may now start. If the stream's current wave is complete, spawn a
   fresh agent with the same name and the next wave's brief instead of resuming.
3. Read any STATUS messages that arrived. A `pr-open` updates the board. A `blocked` names a
   seam: check whether the provider is merged, open or unstarted, and either tell the stream to
   use the stub in the seam table or message the providing stream to prioritise it. A `question`
   goes on the board's question list with the story id.
4. If the question list is non-empty and Matt has not been asked in the last hour, put the whole
   list to Matt in one message, one line per question, with the recommended answer first.
5. Priority reminders for Matt, only when it changes: which open PRs are on the critical path
   (box office D-104 to D-116, bar F-103 to F-108, platform I-102 to I-108) and which carry a
   migration. Migration PRs merge first; otherwise every later one renumbers.

Nightly, or when Matt asks: run `/code-review medium` against each open PR and send the
confirmed findings to the owning stream as a message. Do not post them to GitHub.

## 5. Messages you send

- To a stream, on a merge: first line "MERGED <ids>: you may start <ids>". Then the branch to
  rebase onto, and any seam detail from the PR description.
- To a stream, on a decision: first line "DECISION <story>: <answer>". Then Matt's words.
- To Matt: first line "QUESTIONS (<n>) from the streams". Then one line each.
- Never relay a stream's message verbatim to another stream; state the fact it establishes.

## 6. The board

```
# Unified team board
last check: <ISO timestamp>

| stream | wave | open PRs | working on | blocked on | next |
| --- | --- | --- | --- | --- | --- |

## Seams
| provider | consumer | state (merged / open #N / unstarted) |

## Questions for Matt
- <story>: <question> (recommended: <answer>)

## Log
- <date> <event>
```

## 7. What you never do

- Merge a PR, approve a PR, or push to `unified/main`.
- Write product code. If a stream is stuck on something small, tell it what to do.
- Spawn a second agent with a stream's name while the first is alive.
- Answer a product question yourself. Committee questions go to Matt.
- Ask a stream to do anything your own permissions would block.
