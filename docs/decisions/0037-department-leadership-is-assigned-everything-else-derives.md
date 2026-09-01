# 0037: Department leadership is assigned; every other training standing derives

- Status: Accepted
- Date: 2026-09-01

## Context

0009 already settles that lead roles expire at the committee year end, and 0018 already settles
that trainer standing derives from a current trainer-granting certification. What neither settles
is what that costs at the guard, and building the catalogue slice made the question unavoidable.

A department lead has to be able to edit their own department's modules without holding an officer
role at all. That is authority the permission map cannot express: the map answers "what may this
role do", and the question here is "which departments is this person answerable for". So module G
needs a second guard alongside `requirePermission`, and once there are two guards it has to be
written down which one owns what, or the next author picks whichever they happen to see first.

The old estate's audit is the reason the question matters rather than being a matter of taste: any
trainer or lead could act on any department's work, because standing was one undifferentiated
thing.

## Decision

**A department lead is a row in `department_leads`, and it is the only assigned standing in the
module.** Everything else derives from records and their dates, computed at read time. No column
anywhere in module G stores a validity, a standing or a computed expiry, and `modules` stores an
expiry policy rather than a date. That is 0009 and 0018 applied, not re-decided; what follows is
new.

**Appointing a lead and editing a catalogue are separate authorities.** `training.write` edits any
department's modules and the department vocabulary itself, and is held by the training officer and
the general manager. `training.leads` appoints and removes leads, and is the administrator's alone.
A lead who could appoint could renew themselves past handover, which is the one hole the committee
year expiry could not close on its own.

**Reading and writing the catalogue both honour lead standing, through guards of their own.**
`requireCatalogueReader` and `requireCatalogueAuthority` pass anybody holding the relevant
permission or a live lead assignment; `assertStewards` then scopes a write to the department in
hand. A reader whose only standing is a lead assignment sees their own departments and no others,
because G-110 lists draft visibility as a leads-only surface. A guard that asked only for a
permission would leave a lead able to write a catalogue they could not see.

## Consequences

- A lead edits their department's catalogue holding no role, and holds no authority over any other
  department. The audit's finding is closed by construction rather than by convention.
- Standing to touch the catalogue at all is settled before a request body is read, so somebody with
  no business here learns nothing about the form. Which department a request names is only knowable
  from the body, so that half is necessarily checked after it: a lead of one department aiming at
  another sees the form's shape before the refusal. That is a smaller disclosure to a smaller
  audience, and it is the reason the two checks are separate functions rather than one.
- An assignment table is a thing to keep current, which a derived standing is not. The expiry at
  handover is what stops it becoming the stale list the old estate had.
- A second factor is not required of a lead, because `requireSecondFactorIfPrivileged` weighs
  granted roles and a lead holds none. Whether derived standing should carry that requirement is
  recorded in known issues rather than settled here.
- A successor reading `department_leads` next to a records table with no status column is entitled
  to ask why they differ. Leadership is decided and competence is earned, and only the second can
  be worked out from dates.
