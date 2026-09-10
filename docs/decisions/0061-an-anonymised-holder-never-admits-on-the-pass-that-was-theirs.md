# 0061: An anonymised holder never admits, on the pass that was theirs

- Status: Accepted
- Date: 2026-09-10

## Context

D-130 (admitting a Fellow on their lifetime entitlement) has to decide what happens when a pass
holder, Fellow or otherwise, has been erased and later presents the same pass, self-serve, at the
door, or through a Fellow's own automatic offer on the booking page. Erasure is anonymisation, not
row deletion (0011): the pass itself survives (`passes.user_id` is `scrub`-classified in
`shared/utils/personal-data.ts`, the row stands so booking statistics survive), still `ACTIVE`,
still inside its own validity window, still covering whatever it always covered. Nothing about the
pass's own terms changes, only who is behind it.

0059 and 0060 answer the adjacent question, an anonymised row never being written back over, in
two different shapes for two different callers: 0059's per-statement guard for a migration writer
that cannot enumerate in advance what it is about to touch, and 0060's app-level pre-check,
refusing outright before anything moves, for an administrator action naming exactly two accounts.
Redeeming a pass is neither: it is a single, named account, like a merge, but its write is already
contended for an unrelated reason (capacity, once-per-performance, 0001, 0003), and already carries
a predicate on the statement that spends the seat.

## Decision

**Both shapes, not one.** `passRedemptionRefusal()` (`shared/utils/passes.ts`) checks `anonymised`
first, ahead of every other fact about the pass, so self-serve and the door both refuse with a
plain answer before attempting a write, the same courtesy 0060 gives an administrator. And
`passAdmissionAllows()` (`server/utils/pass-redemption.ts`), the predicate already on
`passAdmissionTicketInsert`'s own `WHERE` for capacity and once-per-performance, gains one more
term: `u.anonymised_at IS NULL`, joined off the pass's own holder. The two are not redundant. The
pre-check is what a caller reads; the predicate is what actually decides, the same division
`passRedemptionRefusal` already keeps between itself and the contended write for every other term
a pass must meet (D-125, 0003).

**This closes the race 0060 accepts rather than closes.** 0060's merge has no reason to add a
`NOT_ANONYMISED`-shaped term to its own statements, because nothing about a merge is otherwise
contended; the gap between its pre-check and its batch is accepted on the terms
`wouldStrandTheSystem()` already stands on. A pass redemption's write is contended regardless, for
capacity, so the identical term costs nothing extra on a statement that already carries a
predicate, and fully closes the same window 0060 leaves open for its own, differently-shaped
caller.

**Scope: every pass, not only a Fellow's.** The guard lives in the one predicate D-125, D-126 and
D-130 all write through (`redeemPass()`), so an ordinary bought pass whose holder is later erased
is refused the same way. Nothing about this is Fellow-specific; a Fellowship is simply the pass
type most likely to still be presented years after its holder is gone.

**What does not change.** The award and the citation stand exactly as A-127 already decided
(0023): an erasure anonymises the person while the theatre's record of the honour survives. Every
admission already taken before the erasure stands too, append-only and untouched (0010). This
record answers only the one question A-127 and 0023 left open: whether the entitlement keeps
being *spent* after the account behind it is gone. It does not.

## Consequences

- `server/utils/pass-redemption.ts`'s `passRedemptionState`, `passRedemptionStateByReference` and
  `redeemablePassQuery` all join `users` and read `anonymised_at`, where before they did not.
- A pass tied to an anonymised account is never offered on the booking page either
  (`redeemablePassQuery`), not only refused at the point of redemption: the same fact, checked in
  the same predicate shape a Fellowship's coverage bypass already uses.
- Self-serve redemption can never actually reach this refusal in practice: an anonymised session
  is never current (`sessionIsCurrent`), so the caller could not have signed in to redeem their own
  pass in the first place. The guard is inert there and load-bearing at the door, which has no
  session to check.

## Options considered

- **Pre-check only, no predicate term**, mirroring 0060 exactly. Rejected: the write already
  carries a predicate for capacity, so leaving the anonymised fact to the pre-check alone would
  reopen exactly the race 0060 explicitly declines to fully close for its own, differently-shaped
  caller, for no saving here.
- **Predicate only, no pre-check.** Rejected: a bare capacity-shaped refusal ("no longer has
  room") would misdescribe what actually happened, at the one call site (the door) where this
  guard is not inert and an officer needs to know why, not a generic capacity figure.
