# 5. Screens

Screens are described in words in this draft, by the page types of the Interface conventions. Two wireframes are drawn, added after Matt accepted part 9 on 16 November.

## Wireframes

![Tonight, front of house section · lead's view on a phone](images/06-tonight-lead-phone.png)

*Tonight, front of house section · lead's view on a phone*

Someone on shift who is not leading sees the same screen without the dashed buttons, the money figures or the arrived toggles. The numbers are sample values.

![Report an incident · three steps](images/06-report-incident-steps.png)

*Report an incident · three steps*

The report asks only for what makes a useful record; category, people and follow-up actions wait for review.

## Members' area

Navigation entry "Shifts", shown to anyone who holds `front-of-house.shift.sign-up` or for whom `front-of-house.rostered` holds.

| Screen | Address | Type | What it shows and does |
| --- | --- | --- | --- |
| My shifts | `/members/front-of-house` | List | Coming shifts first, then past. Each row: performance, duty, call time, state. Total hours this year at the top. Primary action "Find a shift" |
| Open shifts | `/members/front-of-house/open` | List | Published shifts with a place free, grouped by date, with "cover needed" ones first. Filters: production, duty, date. A shift the person is not eligible for is shown with the reason and the remedy, not hidden |
| Shift | `/members/front-of-house/shifts/[id]` | Record | Performance, venue, duty and its description, call time and end, briefing, who else is on (names only, to members). Primary action depends on state: "Sign up", "Withdraw", "I can't do this" (with the notice rule explained before confirming), "Take this shift" for cover, "I'm here" inside the window |

Empty states say what to do: "No shifts are open yet. You'll get an email when the next rota goes up" with a link to notification choices.

## Console

Group "Front of house", in the place the conventions fix for it.

| Screen | Address | Type | What it shows and does |
| --- | --- | --- | --- |
| Rota | `/console/front-of-house/rota` | List | Performances by date with a bar per duty: places filled of places wanted. Filters: production, venue, "unfilled only". Saved views. Bulk action "Apply rota template" and "Publish". A performance in a space the theatre does not manage is marked "Not our space" and skipped by the bulk action; shifts can still be added to it from its own Rota tab |
| Performance rota | Tab "Rota" on the performance record | Record tab | Each shift with its people and their states. Add a person (search by name or email with identity's person picker, searchAccounts, eligibility shown), confirm or decline requests, approve a release, remove, change places and times. "Publish all" |
| Incidents | `/console/front-of-house/incidents` | List | Number, date, kind, severity, state, venue. Default view "Awaiting review". Filters: state, severity, category, venue, date. No free text in the list |
| Incident | `/console/front-of-house/incidents/[id]` | Record | Sections: what happened; people (welfare details behind a "Show" that is audited); actions; log. Primary action "Close"; "Change severity"; "Add action" |
| Night reports | `/console/front-of-house/night-reports` | List | Performance, state, signed off by, exceptions count, incidents count |
| Night report | Tab on the performance, and `/console/front-of-house/night-reports/[id]` | Record | Timings, figures by section, people by duty, checklists with exceptions, incidents by number (a link only for those who may open them), notes, addenda. "Sign off" while a draft; "Add addendum" after. Prints on one sheet |
| Volunteer hours | `/console/front-of-house/hours` | List | Person, shifts worked, hours, no-shows, for a date range. Export |
| Duties | `/console/front-of-house/duties` | List and Form | Name, description, lead, default call and stay, requirements (chosen from what `core.requirement` offers) |
| Rota templates | `/console/front-of-house/rota-templates` | List and Form | Name, venue, default, and lines of duty and places |
| Checklists | `/console/front-of-house/checklists` | List and Form | Name, moment, venue, items in order (drag, or move up and down by keyboard). An item used by a run is archived, not deleted |
| Emergency cards | `/console/front-of-house/emergency-cards` | List and Form | One per venue; body, preview as it appears in live mode, "I have reviewed the whole card" |
| Settings | `/console/front-of-house/settings` | Settings | Generated from part 6 |

The incident form for a reviewer carries a standing line above each free-text box: "Write what happened, not who is to blame. Put names in People, not here."

## Live mode

Reached from the Tonight hub, the on-shift bar, or the console for a manager. Dark, no chrome, 48-pixel targets, the status strip of the conventions.

| Screen | Address | Type | What it shows and does |
| --- | --- | --- | --- |
| Tonight board | `/live/front-of-house/[performance]` | Live | Top: performance, time to curtain, the next timing as one large button ("Open the house"). Then tiles: People (arrived of expected, tap for the list and check-in), Checklists (done of total, exceptions in amber), Figures (contributed), Incidents (open count). Foot: "Report an incident", "Emergency card". Someone leading also sees "Extend tonight" and "Night report" |
| People | `/live/front-of-house/[performance]/people` | Live | By duty: name, state, "Arrived" toggle for someone leading. Shows "not arrived" flags |
| Checklist | `/live/front-of-house/[performance]/checklists/[id]` | Live | One item per row: a large tick, "Problem" (opens reason and note), "N/A". Reading items show a number pad. Progress at the top; "Complete" when every required item has an entry |
| Report an incident | `/live/front-of-house/incident` | Steps | Three short steps: what and where; when and kind; anyone hurt, first aid, emergency services. Then "Sent" or "Saved on this device, will send when online" with the number once known |
| Emergency card | `/live/front-of-house/emergency/[venue]` | Live | The card, large type, kept on the device |
| Night report | `/live/front-of-house/[performance]/report` | Steps | For someone leading: resolve people, review warnings, add notes, sign off |

## What each viewer meets

| Viewer | Sees |
| --- | --- |
| Member, no shift | "Shifts" in the members' area if they may sign up |
| Volunteer with a shift later today | A card on the members' home: duty, call time, briefing |
| Volunteer on shift | Tonight first in the account menu; the on-shift bar; the board without money figures or the People toggles |
| Leading the shift | The same, plus check-in, timings, extend, and the night report |
| Front-of-house manager | The console group; any performance's board at any time |
| Welfare lead | Incidents in the console, with people and welfare details |

## Offline

| Screen | Offline |
| --- | --- |
| Tonight board | Shows the last figures with their age; writes queue |
| Checklist | Fully usable; entries queue |
| Report an incident | Fully usable; the report queues and shows as saved on the device |
| Emergency card | Fully usable once opened on the device |
| Sign-off | Not offered offline: it needs the server's view of the night |

## Accessibility and wording

- State is never shown by colour alone: amber and red tiles carry a word and an icon.
- Every live-mode action is reachable by keyboard and labelled for a screen reader; the checklist announces progress.
- The words are the glossary's: duty (never role), shift, place, cover, Tonight board. On screen there is one word, Tonight (Interface's ruling of 16 November). "Tonight board" is this document's own name for the front of house section of Tonight, headed "Front of house", and is never shown to anyone. A duty manager with a standing ability and no shift can open Tonight too, without the on-shift bar.
