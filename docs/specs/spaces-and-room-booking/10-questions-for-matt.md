# 9. Questions for Matt

Nine questions, all decided by Matt on 16 November 2026. The decisions are written into parts 1 to 8; each question is kept here with its reasoning as the record of why.

**How they were decided.** Matt accepted every recommendation below, "other than where I have already shared a differing opinion". The one such place is question 2: any member may ask, and in the student-society preset every purpose except maintenance needs approval, because at NNT the Theatre Manager decides each request. Question 8 was accepted with the purpose-only default. Under each heading, "Recommendation" is therefore the decision, except in question 2, which states the decision itself.

| # | Question | Decision | Where it shows |
| --- | --- | --- | --- |
| 1 | Does a request waiting for approval keep the time? | No | Rule C4, the calendar, the proof |
| 2 | Who can book out of the box? | Every member may ask; in the student-society preset every purpose except maintenance needs approval | Presets |
| 3 | Can a higher-priority booking displace a lower one, and who decides? | Yes, always through a person, with 48 hours' notice | Rules B1 to B5, SP-32 |
| 4 | When a performance or closure that bumped someone goes away, are they offered the time back? | No, not in the first release | Rule L3, SP-45 |
| 5 | Do no-shows have consequences? | No. They are a figure the approver sees | Rule X6 |
| 6 | Paid hire, and requests from the public? | Later, on the form builder and payments | Scope, SP-43 |
| 7 | Rooms that combine or divide, and resources with a quantity? | Later | Data model, SP-41, SP-42 |
| 8 | What do members see of each other's bookings? | The purpose only, unless the theatre chooses more | Setting default |
| 9 | What is the module called in the menus? | "Room bookings", for the members' entry and the console group alike | Navigation labels, glossary |

## 1. Does a request waiting for approval keep the time?

**Recommendation: no.** Only a confirmed booking occupies time. Two people may both ask for Tuesday at seven; the approver sees both side by side and confirms one, and the other is then refused on confirmation with the first named.

- **For.** A request that keeps the time lets anyone block a room for days by asking, and makes the approver's delay everyone's problem. It also gives "first to ask" the room, when the point of approval is that a person weighs the two.
- **Against.** A member can see a time as free, ask, and learn later that someone else was confirmed. The calendar softens this: approvers see all requests, and the request form says "1 other request is waiting for this time" without saying whose.
- **The other option.** Requests keep the time, first come first served, and expire if undecided. Simpler to explain; worse for a busy building.

## 2. Who can book out of the box?

**Decision: every member may ask, and in the student-society preset every purpose except maintenance needs approval.** Rehearsal purposes are open only to a production's team. In the amateur-company preset rehearsals, auditions and meetings are confirmed at once. In the small-venue preset only staff book.

This is a starting position a theatre changes on the Purposes screen, so the question was only what a new student society sees on day one. The recommendation had meetings confirmed at once; starting with everything needing approval is safer and slower. NNT's own practice settled it. The question put to Matt was: do members book rehearsal rooms themselves today, or ask someone?

**Matt, 16 November 2026:** at NNT a member asks for a room and a time, and the Theatre Manager approves or declines each one. The Theatre Manager also places requests for externally managed rooms and reports back to the member.

**What follows.** The student-society preset starts with every purpose needing approval, except maintenance, so a new society sees what NNT does today: any member may ask, one person decides (part 6). A theatre that wants meetings confirmed at once changes that purpose on the Purposes screen. The external-room flow (rules E1 to E3) is NNT's practice as it stands: the request is recorded, staff mark it as asked, then record the answer, and the member is told.

## 3. Can a higher-priority booking displace a lower one, and who decides?

**Recommendation: yes; never automatically; with notice.** A request that would displace a booking always goes to an approver, who sees who would be moved. It is possible only when the booking is at least 48 hours away (a setting), of a strictly lower tier, and its purpose allows it. The displaced person is told at once with a way to book again. A theatre that dislikes the idea switches it off with one setting, after which only performances and closures displace anything.

The catalogue asked for "bumping with notice" and "priority decided by the system from what the booking is for". The draft keeps both, and adds the person in the middle because being moved by software with nobody to speak to is how a booking system loses its users' trust.

## 4. When the thing that bumped someone goes away, are they offered the time back?

**Recommendation: no, in the first release.** If a performance is cancelled, the room simply shows as free. The people it displaced are not told and their bookings are not restored.

Restoring automatically is wrong more often than right: the person has usually made other plans, and two people may have been displaced from overlapping times. Offering the time is the better later feature (story SP-45), and it is the same mechanism as a waiting list for a room, which is also not in the first release.

## 5. Do no-shows have consequences?

**Recommendation: no automatic ones.** Staff can mark a no-show, and an approver sees a booker's no-shows and late cancellations from the last 90 days when deciding. Nothing is blocked.

An automatic rule ("three no-shows and your bookings need approval") is easy to add later. It is left out now because marking a no-show depends on someone checking the room, which most volunteer theatres will do unevenly, and an uneven record should not drive an automatic penalty.

## 6. Paid hire, and requests from the public?

**Recommendation: later, and built from parts that will exist.** In the first release only signed-in members book, and nothing is charged. A theatre that hires out its hall puts an enquiry form on its public site with the form builder and enters the agreed booking itself under a staff-only "Hire" purpose.

Doing it properly (a price per hour, a deposit, an invoice, terms to accept, a public availability view) needs Payments, Finance and an audience-side account, and is a module-sized piece of work. If hire income matters to the theatres you have in mind beyond NNT, say so and it becomes its own specification.

## 7. Rooms that combine or divide, and resources with a quantity?

**Recommendation: later, both.** In this draft every bookable is one thing with one diary. A hall that splits into two studios would be three bookables with nothing linking them, so a theatre with such a room would rely on staff to notice. Six radios would be six resources.

Both are real, and both change the clash rule from "nothing overlaps" to something that counts, which is exactly the part that must be proved first. I would prove the simple rule, ship it, and add "blocks these other bookables too" as the next step; it fits the data model without changing existing rows. Does NNT, or any theatre you know, have a room like this?

## 8. What do members see of each other's bookings?

**Recommendation: the purpose only ("Rehearsal", 14:00 to 16:00), with the theatre able to choose more.** The setting has three levels: just "Booked"; the purpose; or purpose, title and the booker's name, which is how a shared paper diary on a green-room wall works and what makes it possible to ask someone to swap. Notes are never shown to other members.

Every member gets the calendar through the membership fact, and Identity's rule is that a fact should not hand out other people's details unless the theatre has chosen that explicitly. So the default is the middle level, and a theatre turns names on knowingly.

## 9. What is the module called in the menus?

**Recommendation: "Room bookings".** The catalogue calls the module Spaces, and its id stays `spaces`. But core already owns "space" for a room record, and Box office owns the everyday sense of "booking". A menu entry reading "Spaces" sits oddly beside core's Venues and spaces setup page, and one reading "Bookings" will be taken for tickets. "Room bookings" is plain and wrong only for a van, which seems a fair price. The console group carries the same label, as do the members' entry and every page title, card and message; only the module id and the addresses say spaces.

## Not questions, but worth knowing

- **Roadmap position.** The catalogue places Spaces in tier 2, "running the theatre". Its first release has 36 stories and needs nothing from Box office. It does need the shared calendar component, which Interface has placed in phase 4, so that is the earliest it can ship.
- **The other workstreams have answered.** Core agreed that scheduling a performance over a room booking warns and does not refuse, and that a booking over a performance is refused on the write itself. Foundations, Identity and Interface agreed the rest. Their rulings are listed in part 4.
- **Nothing here has been run.** The clash proof in part 8 is specified, not executed.
