# 5. Screens

Governance has eleven console screens, three account screens, one public page and a feedback sheet in every staff shell. All follow the interface conventions already built: Nuxt UI components first, lists with search by New and archived rows below a collapsible divider, right-click menus on list rows, settings only in the cog modal, inline validation, toasts with Undo where a change can be undone, and square checkboxes.

## Inventory

| Screen | Path | Shell | Who sees it |
| --- | --- | --- | --- |
| Committee | `/console/governance` | Console | `governance.term.view` (default: every body member) |
| Body | `/console/governance/bodies/[id]` | Console | As above; editing needs `governance.post.manage` |
| Post | `/console/governance/posts/[id]` | Console | As above; terms need `governance.term.manage`; checklist needs `governance.handover.manage` |
| Record a term | Modal on Post | Console | `governance.term.manage` |
| End a term | Modal on Post | Console | `governance.term.manage`; the holder sees "Resign" on their account |
| Handover packs | `/console/governance/handover` | Console | `governance.handover.manage` sees all; a holder sees their own |
| Handover pack | `/console/governance/handover/[id]` | Console | `governance.handover.write` on the post; the incoming holder |
| Documents | `/console/governance/documents` | Console | `governance.document.view`; owners see their own |
| Document | `/console/governance/documents/[id]` | Console | As above; actions per ability |
| Documents tab | `core.record-tab` on a production (and any record a kind attaches to) | Console | Whoever may view the record; actions per the kind's abilities |
| Feedback | `/console/governance/feedback` | Console | `governance.feedback.triage` |
| Send feedback | Sheet from the shell's feedback button | Console, live | `governance.feedback.send` (default: everyone in those shells) |
| Your posts | Account section | Members' area | The holder: terms, listing consent, resign, the pack |
| Documents you own | Account section | Members' area | Owners |
| Committee page | `/committee` (theatre's own page using `::committee`) | Public | Everyone. Public documents (constitution, minutes made public) listed under it |
| Settings | Cog modal from any Governance screen, Admin > Modules | Console | `governance.settings.manage` |

## Wireframes

### Committee (console)

The screen a secretary opens in August: who holds what, what is empty, whose handover is stuck.

*Drawing: wireframe · Committee console screen, desktop*

Right-click on a row: Record a term, End a term, Open handover, Edit post. A vacant row shows "Record a term" inline. "Name hidden" means the holder has not agreed to be listed; the role address still shows publicly.

### Post

*Drawing: wireframe · Post page, desktop*

The last block reads the pinned fact mappings so nobody has to visit the roles screen to see what a post opens; changing them stays on Identity's screen.

### Handover pack

*Drawing: wireframe · Handover pack, desktop, while open*

After "Mark ready", contributed sections show "As at 28 Jul 2027". The incoming holder sees "Mark as received".

### Documents (register)

*Drawing: wireframe · Documents register, desktop*

Sorted by urgency: lapsed, then review due, then drafts, then current by title. The filters are searchable dropdowns. A row's menu offers Upload version, Sign off, Review unchanged, Retire.

### Committee page (public)

*Drawing: wireframe · public committee page, desktop*

A holder who has not agreed is shown by the post's name, never by a blank. From the end of the grace period after a year end, until a term starting in the new committee year is recorded for the body, the page carries "This list may be out of date", as NNT's does (decision 0107).

### Send feedback (sheet)

*Drawing: wireframe · Send feedback sheet, desktop*

On a phone it is a bottom sheet. After sending: a toast "Thanks, sent to the people who look after this system". Nothing else changes on the screen, so a duty manager can report mid-show.

## Wording and accessibility

- "Post" and "term" in the console; the public page says "committee" or the body's own name. "Board" in the small-venue preset follows Identity's preset names.
- States are words and icons, never colour alone. Dates are written out ("1 Oct 2026").
- Every action is reachable by keyboard; the right-click menus repeat the row's "..." button.

## Meetings and actions (first release)

Added after Matt's answer to question 6. Names in the wireframe are invented.

**Meetings list** (console, `/console/governance/meetings`, and a Meetings tab on each body's page). Upcoming first, then held, with past meetings below a collapsible divider. Columns: date, body, title, state badge, attendance (present of expected) and minutes state. Search icon by New. Right-click on a row: open, send agenda, cancel. New opens a short form (body, kind, title, start, end, space or place, online link); "Find a time" opens Availability's planner for the body's group, which comes back here prefilled.

**Meeting page** (`/console/governance/meetings/<id>`). Header with title, time in theatre time, place, state badge and one primary action that follows the state (Send agenda, Mark held, Write minutes). Four tabs:

- **Agenda.** The items in order, draggable with @dnd-kit/vue while not held; each item shows its presenter and opens a side sheet for notes. Reserved items carry "Members only". "Minutes of the last meeting" has an Approve button when the previous minutes wait for sign-off; "Matters arising" lists the body's open actions live.
- **Attendance.** Expected holders with a three-way segmented control (present, apologies, absent), apologies already sent shown with their time, guests as free names. The quorum line reads "Quorate: 5 of 4 needed" or "Inquorate: 3 of 4 needed".
- **Minutes.** The `governance.minutes` document's latest version in the register's editor, with Sign off for a signer, and the version history.
- **Actions.** The actions raised at this meeting, with owner, due date and state; New action from here or from an agenda item's menu.

*Drawing: meeting page wireframe · agenda tab*

**Actions list** (console, `/console/governance/actions`). Every open action of the bodies the viewer manages, overdue first, filter by body and owner; done and dropped below the divider. Right-click: mark done, drop, change owner or due date.

**Your meetings** (account). Upcoming meetings of the bodies the person sits on, with Send apologies until the start, the agenda (reserved items shown, since they are members) and approved minutes of past meetings.

**Your actions** (account, and a home card when any are open). The person's own actions and those of posts they hold, overdue first, with Mark done and an optional note.

**Feedback sheet, with the upstream setting on.** Under the words box, for a bug only, one unticked square checkbox: "Also send my words to the Proscenium project (the technical details are sent without them)". The sheet's footer says in one line that technical details of bugs go to the Proscenium project, with a link to what is sent. With the setting off, neither appears. The triage queue shows "Sent to the Proscenium project" with its link, or "Not sent", on each bug.
