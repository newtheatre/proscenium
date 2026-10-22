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
- The form's refusals are sentences, and the card names the Front of House Manager.

## Consequences

- The card still opens only signed in. Showing the address to a signed-out phone was suggested and
  is left for a decision of its own: the card carries more than an address.
