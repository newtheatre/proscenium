# 0201: Nobody approves their own room request

- Status: Proposed
- Date: 2026-10-21
- Extends: 0116 (self-dealing is refused where the write happens)

## Context

A room request is an exception to the policy that somebody else agrees to (C-108). The hands-on
review of 21 October 2026 found that a Theatre Manager holding a membership could ask for an
exception and then approve it from the queue, recording themselves as the person who decided. Their
own request also emailed them as an approver. 0116 already refuses four kinds of self-dealing on the
writing statement; this is a fifth of the same shape.

## Decision

**The approving write refuses a request whose requester is the approver.** `approveStatement()`
carries `target.user_id <> actor` in its predicate, so every caller inherits it and a batch cannot
slip one through. When the write matches nothing, the read that chooses the words reports
`why: 'own'` with "That request is yours, so somebody else decides it".

- No role is exempt, as in 0116. The IT Manager and the Theatre Manager decide each other's requests.
- Turning one's own request down is allowed: it frees the slot, which the requester could do anyway
  by cancelling.
- The queue shows "Yours: somebody else decides it" on one's own row in place of Approve and the
  arrows. The server is the authority; the screen only avoids offering a button that would fail.

## Consequences

- An estate with a single approver cannot approve that approver's own requests. Since 0200, an
  officer's own booking inside the rules needs no approval at all, so this only bites on genuine
  exceptions, which is where a second person is wanted.
- The approver notification still goes to every approver, including the requester; the queue is
  where it is enforced.
