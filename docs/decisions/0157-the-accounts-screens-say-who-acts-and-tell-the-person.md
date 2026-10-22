# 0157: The accounts screens say who acts, and tell the person

- Status: Proposed
- Date: 2026-10-22
- Amends: 1304's refusal wording for the People screens; A-122 for what the person is told

## Context

The process map (people, 21 Oct 2026) found the accounts directory, an account's page and the
roles register misleading in small ways that add up:

- the President and the Theatre Manager were offered **Add someone** and the whole merge picker,
  and both ended in a bare 403 after the form was filled;
- a refusal on a People screen named the President and the Theatre Manager, never the IT Manager
  who makes every change there;
- the reset-authenticator dialogue and the docs said a privileged officer "cannot sign in again",
  when they can, and only their role's screens are refused (and since 0152, only what that role
  adds);
- nobody was told when the IT Manager reset their authenticator or enabled their account;
- a merged account read "Erased on …", with no way to the account it went into;
- the trail showed a membership claim withdrawn but never one sent;
- the roles register counted a privileged grant that waits on an authenticator as a holder, with
  a blank state, and called a further-notice grant "Permanent";
- a past day typed into the grant form left **Grant it** live and doing nothing.

## Decision

- **Only the IT Manager is offered what only the IT Manager can do.** **Add someone** shows with
  `accounts.create`, the merge picker with `accounts.merge`; anybody else reading an account
  sees the merge card say that the IT Manager carries out merges.
- **A People screen's refusal still names who reads it**, and adds "The IT Manager makes every
  change on it." The flag sits on the nav entry, beside the ability, so the two cannot drift.
- **The reset copy says what happens:** they can still sign in, and a privileged role's screens
  are refused until they set up a new authenticator.
- **A reset and an enable are emailed to the person**, with the next step. A disable stays
  silent, as its sign-in refusal already is (A-122 criterion 1), and so does sign out
  everywhere, which says nothing the person needs to act on.
- **A merged account names the winner**, linked, from the merge's own audit entry; its badge
  reads **Merged**.
- **Sending a claim is audited** as `membership.claim.sent`, with the claim and the term, never
  the student number.
- **The register marks a waiting grant "Needs an authenticator"** and leaves it out of the holder
  count, using the same rule as the grant route: a privileged role, a password account and no
  confirmed authenticator. A further-notice grant reads **Until further notice**.
- **A past day in the grant form says "Pick a date from today on"** and keeps **Grant it** off.

## Consequences

- The register's holder count can be lower than the rows shown for a role; the badge says why.
- The privileged list comes from configuration and rides as one JSON parameter (0006).
