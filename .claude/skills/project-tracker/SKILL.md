---
name: project-tracker
description: Use when creating, closing, re-phasing or reorganising GitHub issues, epics, sub-issues, milestones or the project board for the unified system, or when the backlog files and the tracker need reconciling.
---

# Managing the tracker

The tracker mirrors `docs/backlog/`; the backlog files are the source of truth for what a
story means, the tracker for where it stands. Never let the two disagree silently.

## The structure

- **Epics** (label `epic`): one per module, issues #326 to #336, plus the migration tooling
  epic (#338) and the Phase 0 gate (#337). Each module epic holds its stories as native
  sub-issues; its body links the backlog file and lists resolved stories that have no issue.
- **Story issues**: one per active backlog story, titled `<id>: <title>` (for example
  `D-108: One stable QR per booking, wallet-saveable`), body carrying the full story block
  and a link to its backlog file. Labelled `unified` plus `phase:mvp`, `phase:v2` or
  `phase:later`.
- **Milestones**: Phase 0: Gate, Phase 1: Foundations, Phase 2: Modules, Phase 3: Cutover,
  Phase 4: Hardening, V2. MVP stories carry their module's build milestone (Phase 1 for
  Identity, Governance, Platform; Phase 2 for the rest); V2 stories carry V2; Later stories
  carry none.
- **The board**: org project "Unified system" (number 6). Every issue is an item with two
  single-select fields set: Module and Phase.

## Rules

1. **A new story** starts in the backlog file (next free id in its block: MVP from x-101, V2
   from x-201, Later from x-301), then gets its issue, sub-issue link to the module epic,
   labels, milestone and board fields. Update the counts line in the backlog file and the
   table in `docs/backlog/README.md`.
2. **Re-phasing** (MVP to V2 at a gate review, for example) changes the backlog file's Phase
   line, the issue's phase label, its milestone and the board Phase field, all in one pass;
   the argument for the move is recorded in the backlog file's open questions.
3. **Resolving without building** (constraint or spike outcome): the backlog story keeps its
   id and gains a Resolution block; the issue is closed as not planned with a comment naming
   the reason; the epic body's resolved list gains a line. Counts reconcile.
4. **Closing built work**: the story issue closes when its acceptance criteria are pinned by
   passing tests and the change is merged; the closing comment links the pull request. Epic
   progress bars update themselves.
5. **Ids are permanent.** Never renumber, never reuse, never retitle an id to mean something
   else.
6. Bulk operations go through `gh` (REST for issue creation and sub-issue linking, project
   commands for the board) with pacing; write the script to a file, log failures, verify
   counts afterwards against `docs/backlog/README.md`.

## Useful invocations

- Sub-issues of an epic: `gh api "repos/newtheatre/proscenium/issues/<epic>/sub_issues?per_page=100"`
- Link a sub-issue: `POST repos/newtheatre/proscenium/issues/<epic>/sub_issues` with
  `{"sub_issue_id": <database id, not the number>}`
- Board fields: project 6, owner `newtheatre`; find field and option ids with
  `gh project field-list 6 --owner newtheatre --format json`.
