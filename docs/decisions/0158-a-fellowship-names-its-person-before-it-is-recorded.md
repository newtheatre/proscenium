# 0158: A fellowship names its person before it is recorded

- Status: Proposed
- Date: 2026-10-22
- Amends: 0023 (the fellowship pass) for who issues it

## Context

The process map (people, 21 Oct 2026) recorded a fellowship against the wrong person: the
picker's first match for "Pat" was another account, and taking it issued that person a lifetime
pass. Once revoked, the mistaken award left them unable ever to be honoured, and the refusal said
they "already hold" a fellowship, which was untrue. It also found an award dated in the future
accepted, every empty field answered with the house's generic "Something on this form needs
another look", and the pass recorded as issued by the Fellow rather than the officer.

## Decision

- **The first press of Record the award names the person**, with their address, and the button
  becomes **Award it to (name)**. Only the second press records it. Changing the person asks
  again.
- **A second award's refusal says which kind of fellowship they hold.** A revoked one reads
  "That person holds a revoked fellowship", and the docs say restoring one, or correcting an
  award to the wrong person, is the committee's to take to the IT Manager. The one-per-person
  constraint (A-127 criterion 2) is unchanged: whether a revoked fellowship may be followed by a
  fresh award is a governance choice, left for the committee rather than made in code.
- **An award is dated today or earlier.**
- **Each field says what it wants when left empty.**
- **The pass is issued by the officer who recorded the award.** Passes issued before this keep
  the Fellow as issuer; the `pass.issued` audit entry already names the officer.

## Consequences

- One extra press per award, on a form used a handful of times a year.
