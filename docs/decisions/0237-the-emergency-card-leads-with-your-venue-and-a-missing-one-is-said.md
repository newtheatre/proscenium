# 0237: The emergency card leads with your venue, and a missing one is said

- Status: Proposed
- Date: 2026-10-22

## Context

The 21 October process map found the emergency screen showing a card for every venue running
tonight at the same weight, so a test performance in a rehearsal room put a third, empty card
in every volunteer's way. A venue ran all evening with no card filed and nothing on the console or
the hub said so before doors. A what3words address typed as what3words prints it ("///a.b.c")
showed with six slashes, since the card draws three of its own. The form's refusals began in
lower case, and the card asked volunteers to tell "the front of house officer", a role no other
screen names.

## Decision

- The venues the reader works tonight still lead; when they work some and not others, the others
  fold under **Other venues tonight**. They stay in the page, so the cached, offline copy carries
  them, and somebody working none of tonight's venues sees every card open.
- A running venue with no filed card (no address on its latest version, the same rule the console
  table uses) is a **Set-up still to do** line for whoever holds `emergency-card.write`, and every
  shift's hub says so in red for its own performance.
- what3words is stored without leading slashes, and a card filed before this shows without them.
- The card names the Front of House Manager. The form's refusals were made sentences by 0217, which landed first.
- A phone with nobody signed in opens the card as well, decided by the IT Manager on 22 October
  2026. It shows each running venue's name, address and what3words, and Call 999, with a sign-in
  button; the server sends nothing else for a signed-out request, and the screen trims any cached
  full copy the same way. Exits, first aid, notes, tonight's first aiders, the duty manager and
  the card's own first call stay signed in: they are the building's business, and 999 is always
  a right first call.

## Consequences

- Every other show-night screen still sends a signed-out visitor to sign in; the emergency card is
  the one exemption, named in `tests/unit/night-signed-out.test.ts`.
- A venue's emergency address is readable by anyone during a night it runs. It is the address an
  audience is already sent to.
