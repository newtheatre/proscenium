# 0159: A revoked fellowship makes way for a fresh award

- Status: Proposed
- Date: 2026-10-22
- Amends: A-127 criterion 2; 0158 on what a second award after a revocation does

## Context

A-127 criterion 2 held a person to one fellowship row for ever, enforced by a unique index on
`fellowships.user_id`. A revocation kept the row, so a revoked person could never be honoured
again: not after a mistaken award to the wrong account (the process map's own case), and not
after the committee reversed a revocation. 0158 left that as a governance question. The IT
Manager answered it on 22 October 2026: allow a fresh award.

## Decision

- **One standing fellowship per person, not one row.** The unique index becomes partial,
  `fellowships_one_standing` on `user_id` where `revoked_at IS NULL`. A revoked row stays as
  history, untouched (0023, 0010), and a fresh award is an ordinary new row with its own pass.
- **The award checks only for a standing fellowship.** "That person already holds a fellowship"
  is the one refusal; the revoked-fellowship refusal 0158 added goes, since there is nothing left
  to refuse.
- **An account's page shows the standing fellowship first**, then the most recent revoked one.

## Consequences

- The migration drops one index and creates another; no table is rebuilt, so nothing cascades
  (0037).
- The roll can list one person twice, once revoked and once current, which is the true history.
- Reversing a revocation is a fresh award, with its own date and citation, not an edit of the old
  row.
