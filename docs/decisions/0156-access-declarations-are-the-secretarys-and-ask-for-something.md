# 0156: Access declarations are the Secretary's, and ask for something

- Status: Proposed
- Date: 2026-10-22
- Amends: D-127 (access profiles), for where the queue lives and how the Secretary hears of it

## Context

The process map (people, 21 Oct 2026) found four things wrong with access declarations:

- a save with no need ticked, no companion and no words was accepted, and put a Pending
  declaration in front of the Secretary with nothing to sight;
- the Secretary was never told a declaration was waiting: the only signal was a count on the
  console, which they had to think to open;
- the consent switch saves at once while the rest of the form needs **Save changes**, and the
  page did not make the difference plain;
- the queue lived at `/box-office/access-profiles`, under Box office, although D-127 and 0113
  say the box office never verifies.

## Decision

**A declaration must ask for something.** At least one need, a companion, or words of the
member's own. The same rule runs in the form and on the server; it landed first with the access
ticket type work (`SAYS_DECLARATION_EMPTY` in `shared/utils/access-profiles.ts`), and this record
adopts it rather than adding a second check.

**The Secretary is told daily while any declaration waits**, by email and in the inbox, in the
shape of the membership claims notice (A-130 criterion 12): one message per verifier per London
day, counting them and saying since when. It goes to every live holder of `access.verify`, which
is the Secretary and Welfare Officer and the IT Manager. Like that notice it has no topic, so no
preference silences it.

**The consent switch says it saves on its own**, and that **Save changes** is for the rest.

**The queue moves to `/people/access`, as Access declarations under People.** The old address and
its documentation page answer 301 to the new ones.

## Consequences

- The Secretary's console sidebar now shows a People group (Fellows and Access declarations)
  rather than a lone Box office entry.
- Screenshots for the queue keep their old image path, so the docs-shots run is unchanged
  apart from the address it visits.
