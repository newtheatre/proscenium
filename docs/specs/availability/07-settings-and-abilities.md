# 6. Settings and abilities

Nineteen settings and eight abilities. No new preset role: planning authority comes from the groups other modules contribute (a production's team leads, a body's post holders), not from a standing grant, in the spirit of 0009.

## Settings

Groups `grid`, `entry`, `requests`, `polls`, `safeguarding` and `retention`, plus import (below), all on the module's generated page under Admin > Modules > Availability, one section per group, none advanced. Every setting is changed by holders of `availability.settings.manage`, has audience staff and is not quotable. Durations use the kit's DurationInput. The three retention settings are onChange confirm, because shortening one deletes rows at the next sweep. Every number is a proposed default for the workshops.

| Key | Kind | Default | Limits | Purpose |
| --- | --- | --- | --- | --- |
| `availability.grid.step` | choice | 30 minutes | 15, 30, 60 minutes | The grid's smallest cell. Changing it never moves stored times (A2) |
| `availability.grid.day-starts` | time | 09:00 | 00:00 to 12:00 | First row shown before scrolling |
| `availability.grid.day-ends` | time | 23:00 | 15:00 to 24:00 | Last row shown before scrolling |
| `availability.entry.unmarked-default` | choice | unknown | unknown, free | What unmarked time means for people who have not chosen (A4, question 1) |
| `availability.entry.horizon` | duration | 12 months | 1 to 24 months | How far ahead people may enter (A3) |
| `availability.entry.stale-after` | duration | 30 days | 7 to 180 days | After this without a change, Find a time marks the person "may be out of date" |
| `availability.requests.default-due` | duration | 7 days | 1 to 60 days | The due date offered when opening a request |
| `availability.requests.first-reminder` | duration | 3 days | 0 to 14 days; 0 turns it off | Before the due date |
| `availability.requests.second-reminder` | duration | 1 day | 0 to 7 days; 0 turns it off | Before the due date |
| `availability.polls.abandon-after` | duration | 14 days | 1 to 60 days | After the answer time, an undecided poll is abandoned (F8) |
| `availability.safeguarding.one-to-one` | boolean | true |  | Warn when a find or meeting has exactly one adult and one under-18 (F6) |
| `availability.retention.past` | duration | 90 days | 0 days to 2 years | After an exception's last date, it is deleted (A3) |
| `availability.retention.history` | duration | 1 year | 3 months to 3 years | How long closed requests, finished polls and past meetings are kept |

The `import` group, added on 24 November for calendar imports (I1 to I5). Turning a kind off stops its refreshes and deletes its imported blocks at the next sweep, so the three switches are onChange confirm. Google and Microsoft also need that sign-in provider set up in the site; their credentials live on Identity's provider cards, never here and never as a Worker secret.

| Key | Kind | Default | Limits | Purpose |
| --- | --- | --- | --- | --- |
| `availability.import.ics` | boolean | true |  | Offer "Calendar address" on S14 |
| `availability.import.google` | boolean | true |  | Offer Google on S14 when the Google provider is set up |
| `availability.import.microsoft` | boolean | true |  | Offer Microsoft on S14 when the Microsoft provider is set up |
| `availability.import.window` | duration | 90 days | 14 to 366 days | How far ahead a refresh reads (I3) |
| `availability.import.refresh` | duration | 1 hour | 15 minutes to 24 hours | How often each connection refreshes (I5) |
| `availability.import.max-connections` | number | 3 | 1 to 5 | Live connections per person (I1) |

The late-finish time for under-18s is not Availability's: it reads the shared core key `core.under-18.latest-finish` (R3-25), a time that ships unset, so no late warning shows until the theatre sets it.

## Abilities

| Ability | Acts on | Risk | Owner | Implies | Purpose | Suggested holders |
| --- | --- | --- | --- | --- | --- | --- |
| `availability.own.manage` | site | normal | grants |  | Enter and change one's own availability; answer requests and polls; see S6 | Every signed-in account |
| `availability.find.use` | site | normal | ignored |  | Use Find a time and polls for groups where canPlan is true; the group check does the real work | Fact `core.member`; preset `volunteer` |
| `availability.find.anyone` | site | privileged | ignored | find.use | Plan for any member, not only one's own groups. `audit: 'read'` | `committee-member` |
| `availability.request.send` | site | normal | ignored | find.use | Open, remind and close requests for groups one plans for | Fact `core.member` |
| `availability.entry.on-behalf` | site | normal | ignored | find.use | Add a busy or maybe entry for a member of a group one plans for (A8) | Fact `core.member` (the group check limits it) |
| `availability.meeting.arrange` | site | normal | ignored | find.use | Arrange, move and cancel meetings | Fact `core.member` |
| `availability.meeting.view` | `availability.meeting` | normal | grants |  | Open a meeting one is invited to | Owner (invitee); the organiser |
| `availability.settings.manage` | site | privileged | ignored |  | Change the settings above | `administrator` |

Notes:

- **No override for reasons.** No ability shows a reason the person did not share, not even to an administrator or welfare lead. Rehearsals' old `rehearsals.conflict.view` is retired rather than moved (question 2).
- **find.anyone is privileged** because it reaches every member's time, and is audited on read. Holding it does not show shared reasons: those follow group membership only (A7).
- **Owner grants** on `own.manage` and `meeting.view` is what lets people see their own rows; the services limit what they see.
- **No facts declared.** Nothing in this module confers authority elsewhere.
