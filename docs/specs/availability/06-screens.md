# 5. Screens

Fourteen screens, all in the members' area except settings; S14, added for calendar imports on 24 November, is described below the table. Nuxt UI components first, as everywhere; the grid is the one custom component, shared by My availability, the request page and Find a time.

## Inventory

| # | Screen | Address | Who sees it | What it does |
| --- | --- | --- | --- | --- |
| S1 | My availability | /members/availability | Anyone signed in | Week grid to paint free, maybe, busy; whole day by its heading; drag on a computer, tap then tap on a phone; commitments shown as outlined blocks with their label; calendar imports hatched, "From your calendar", with "Connect a calendar" (S14); "Updated 3 days ago"; links to patterns and exceptions (W1) |
| S2 | Weekly patterns | /members/availability/patterns | The person | List of patterns with dates; editing one is S1's grid for a single week; "Copy from last term" |
| S3 | Add or change an exception | Slideover on S1 | The person; a planner for A8 | Dates, weekdays, whole day or times, level, reason, "Share the reason with people who plan for me" |
| S4 | Asked of me | /members/availability/requests | The person | Open requests and polls asking them, with due dates |
| S5 | Answer a request | /members/availability/requests/\<id> | The person asked | The request's period as S1's grid, the organiser's message, "This is right" |
| S6 | Who can see my availability | /members/availability/privacy | The person | Each group they are in and who plans for it (from `groupsOf`), what planners see, what they never see |
| S7 | Find a time | /members/find-a-time | Anyone who may plan for a group | Choose people, range, hours, length, rooms; overlap grid; best times; who is free in a slot; "Send a poll", "Turn into…" (W2) |
| S8 | Poll results | /members/find-a-time/\<id> | The organiser | Tallies per slot as answers arrive, who has not answered, "Decide", "Abandon" |
| S9 | Answer a poll | /members/polls/\<id> | Poll people | Yes, if need be, no for each slot; one save (W3) |
| S10 | Turn into… | Modal on S7 and S8 | The organiser | Targets the organiser holds the ability for; opens the owner's draft in a new tab |
| S11 | Requests I have sent | /members/find-a-time/requests and detail | Organisers | Each request with answered, asked, lapsed, withdrawn; "Remind now" (at most once a day); "Close" |
| S12 | Meeting | /members/meetings/\<id> | Invitees; the organiser edits | Time, place, agenda; Going or Not going; organiser can move, change, cancel; under-18 warnings to the organiser |
| S13 | Settings | Admin > Modules > Availability | `availability.settings.manage` | Part 6's settings, one section per group |

Embedded elsewhere, owned by their modules: the Productions workspace tab "Availability"; the Rehearsals planner's busy and maybe marks; the front of house rota grid's level dots (FH-48).

**S14, Connect a calendar** (`/members/availability/calendars`, the person only). Lists the person's connections with label, kind, "Synced 12 minutes ago" or the broken state, "Refresh now" and "Disconnect". "Connect a calendar" opens a modal with up to three choices, as switched on: **Google** and **Microsoft** go to the provider's consent page and come back to name the connection; **Calendar address** takes a label and the secret address, with a short help panel showing where Google and Outlook keep it, and saves only after a trial fetch reads. Each connection has one setting, "Tentative events count as" maybe, busy or ignore. The page says plainly what is kept (times only) and what is not (titles, places, people), and that disconnecting deletes the imported times at once.

On S1, imported time is hatched in its level's colour; tapping it says "From your calendar: Uni timetable" and offers "Mark free instead", which writes an exception (A4).

## How the grid reads

- Free is green, maybe amber, busy red, unknown grey hatched, each with a letter or icon as well so colour is never the only signal. Commitments are an outlined block on top with their label, and a lock icon: they cannot be painted over. Imported calendar time is hatched, shows only to its owner as imported, and can be painted over with an exception.
- In Find a time each cell shows a count ("7 of 9 free") and its colour deepens with the share free. Hover or tap lists names under Busy, Maybe, Unknown and Committed, with a commitment's label. Reasons appear in italics only where A7 allows.
- A slot failing a must-have person is dimmed. Warnings (late finish for an under-18, one-to-one) show as a small triangle on the slot and a line in the side panel, to the organiser only.
- Times run 09:00 to 23:00 by default (settings), scrolling for the rest; the step is the site's grid step.

## Wireframes

(Diagram in the Claude Doc: https://claude.ai/artifact/RDYGyCYpg3RvKRGqyryC31) W1 · S1 My availability, desktop

Painting over a pattern day writes an exception, never the pattern; the person is asked once whether they meant "just this week" or "change my Term time pattern". On a phone the grid shows three days at a time and swipes.

(Diagram in the Claude Doc: https://claude.ai/artifact/RDYGyCYpg3RvKRGqyryC31) W2 · S7 Find a time, desktop

On a phone the left panel becomes a sheet above the grid, the grid shows two days at a time, and best times come first.

(Diagram in the Claude Doc: https://claude.ai/artifact/RDYGyCYpg3RvKRGqyryC31) W3 · S9 Answer a poll, phone

The request page (S5) works the same way on a phone: the period as a three-day grid, the organiser's message on top, and "This is right" as the one button.
