# 0240: Only a published module is awarded, required or taught, and a trainer finds people

- Status: Proposed
- Date: 2026-10-21
- Amends: G-108 (prerequisites), G-112 criterion 3 (what a session teaches), G-120 (sign-off), G-130 criterion 1 (the people picker)

## Context

The hands-on map of 21 October 2026 drove the training screens end to end and found five holes.

- A draft module could be made a prerequisite of an active one. Nobody can obtain a draft, so the
  active module could then never be signed off, and the draft's title leaked to the public module
  page, which promises drafts never appear.
- A draft was offered under **Sign something off** and could be awarded, then showed on the
  member's own page as held.
- A certification could be taught at a session, although the form says certifications are not
  taught by session and the docs say they are signed off.
- Signing a module off twice on one day made two records. Revoking the newer one left the older,
  so after "Revoke the record" the person still held it.
- A trainer holds no `accounts.read`, so the person search in **Log a session** and in a
  register's walk-in panel found nobody: a trainer on the door could add a walk-in only by address.

## Decision

1. **A prerequisite is an active module.** Adding an edge to a draft or a retired module is a 409
   naming it. An edge made before this rule is still read, and the member catalogue names a draft
   prerequisite "A module not yet published" rather than by its title.
2. **Only an active module is awarded outside a session.** `assertAwardable` refuses a draft as it
   already refused a retired module, so a sign-off and a certificate refuse it alike.
3. **A certification is never taught at a session.** `assertTeachable` refuses it beside a
   sign-off-only module, and the planner does not list it.
4. **One unrevoked award per person, module and day.** A second award dated the same day is a 409.
   The insert carries the check as well as the read before it, so two awards sent at once write one.
   Different days still supersede, which is how renewal works. A revoke answers `stillHeld` when
   another current record of the module remains, and the screen says so.
5. **Whoever may award by any path may search people.** `GET /api/admin/training/people` answers
   the Theatre Manager, a live lead, and now anybody with current trainer standing, still with an id
   and a name and nothing more. The register and the delivery log ask it when the viewer holds no
   `accounts.read`.

## Consequences

- An existing draft prerequisite edge, or an existing same-day pair, is not rewritten: both are
  history, and the first is now harmless publicly. Withdraw the edge in the editor.
- A trainer can find any member by name, address or student number, the same reach a lead had.
  They see names only, which is what a register shows anyway.
