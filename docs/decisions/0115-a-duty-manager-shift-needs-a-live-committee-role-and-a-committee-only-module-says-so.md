# 0115: A duty manager shift needs a live committee role, and a committee-only module says so

- Status: Accepted (IT Manager, 29 September 2026)
- Date: 2026-09-29
- Amends: E-103 (who a duty manager shift is offered to) and E-111 criterion 1 (what a confirmed
  duty manager shift opens); extends 0009, 0037 and 0075, and reads "the Committee" as 0113 defines it

## Context

The duty manager shift is gated on Committee Operations and Governance (`ADMN-201`), which the
committee's own sessions teach (IT Manager, 26 September 2026, issue 1318). The role audit on
issue #1211 found that this made "committee only" a matter of who happened to be in the room: the
catalogue had no switch limiting who may sign up to a module, and a training record outlives the
committee year. `ADMN-201` is worth an academic year, to 30 September, and with the carry-over an
August award lasts to the September after next; the workshops' 12 months from award outlasts the
committee year (31 July) and a resignation just the same. So a member who had left the committee,
or who had never been on it but sat a session, held everything a duty manager shift asked for.

The IT Manager answered the audit's question 3 "yes, at claim and at use", and question 4 "yes,
both" (ADMN-101 becomes a prerequisite of ADMN-103 and ADMN-201). He then asked whether training
could be restricted so that somebody without a committee role does not see it, or sees it
disabled as only available to the committee.

## Decision

**A duty manager shift needs a live committee role as well as its training, at claim and at use.**
A committee role is a live grant of any role in `COMMITTEE_ROLES` (the five post roles and
`COMMITTEE`) on a usable account, read the way every other "the Committee" is (0113). `ADMIN` alone
is not one: it is a function its delegate may hold without a post.

- *At claim.* The self-claim, an officer's assignment, an officer's ad hoc shift naming somebody,
  and the confirmation of a queued claim each carry the committee role as a predicate on the
  writing statement beside the training gate (0003, E-104, #1302), so a grant lapsing between the
  check and the write confirms nobody. The refusal names what is missing: a duty manager shift is
  for committee members. A queued claim whose claimant has left the committee is refused as "No
  longer qualifies" and offered Decline with that reason filled in (E-105 criterion 3).
- *At use.* A confirmed duty manager shift opens the duty manager's screens, door cover (0095)
  and the comp approvals only while its holder holds a live committee role. The shift stays on the
  rota for an officer to reassign; it simply opens nothing, and the refusal says why. The officer
  bypass (0044) is unaffected: it is a standing permission, not a shift.
- *On the list.* A member without a committee role is not offered a duty manager shift, and it is
  not among the "Roles you could take", since no training opens it for them.

**A standing grant narrows shift eligibility and never widens it.** Authority still derives from
the confirmed shift and a current training record (0009); the committee role is one more fact the
shift must stand on, not a grant that opens anything by itself.

**A training module may be marked committee-only.** `modules.committee_only` is a flag the
catalogue editor sets (0112), read by the catalogue import from a `Committee Only` column. For a
member without a live committee role, a committee-only module is still listed in the catalogue,
on the sessions list and in what's next, so the committee's work stays visible, but its one
action is disabled and reads "Only available to the committee". Signing up to a session that
teaches one, and asking for one to be taught, are refused at the write path with the same words.
The flag is about self sign-up: a lead or trainer marking the register, adding a walk-in or
logging a delivery (G-116, G-117, G-118) is not blocked by it, because recording what somebody
was taught is the trainer's judgement and 0037's department standing already governs it.
`ADMN-201` is committee-only; `ADMN-102` (Selling Alcohol) is not.

**The 26 September catalogue decisions stand in `data/catalogue.csv`.** `ADMN-101` is a
prerequisite of `ADMN-102`, `ADMN-103` and `ADMN-201`, so the door, the bar and the duty manager
share one foundation. The live catalogue is imported by id (0075), so each of these is also a
console edit on the live module.

## Consequences

- Migration 0131 adds `committee_only` to `modules` as a plain boolean defaulting to false. The
  old estate's import (0075) never writes it, so a console edit survives a re-run.
- The end-to-end fixtures that confirm a duty manager shift give its holder the `COMMITTEE` role,
  which carries no second factor (A-112), so the fixture tests the shift and not the grant.
- A committee member who resigns loses the duty manager screens on the next request, as a
  released shift does (E-111 criterion 3); the rota board still shows the shift as held until
  somebody reassigns it.
- A session teaching a committee-only module beside an ordinary one is closed to self sign-up for
  a member without a committee role, as a whole: a sign-up is to a session, not to one of its
  modules.
- The live `ADMN-101`, `ADMN-103` and `ADMN-201` edits, and ticking **Committee only** on
  `ADMN-201`, are manual steps in the training console once this deploys.

## Options considered

- **Hide the module from anybody without a committee role.** The catalogue is public (G-128) and
  says what the theatre teaches; hiding the committee's own training makes it look as if there
  were none. Disabled with the reason given is the IT Manager's second offer, and answers the
  question a member would otherwise ask.
- **Check the committee role at claim only.** A resignation or the 31 July lapse would leave a
  former member running the house until their shift passed. The IT Manager asked for both.
- **Grant duty manager authority by role.** A standing grant as operational authority is what
  0009 rules out; the role narrows, the shift still decides.
- **Let the register refuse a committee-only module too.** It would stop a trainer recording what
  they taught, and the record is the fact 0009 builds on; standing to record already belongs to
  the lead (0037).
