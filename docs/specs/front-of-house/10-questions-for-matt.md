# 9. Questions for Matt

**Decided, 16 November 2026.** Matt accepted all ten recommendations in the thread. Each recommendation below is now the decision, and the rest of the document is written to it. The options are kept for the record.

| # | Question | Recommendation |
| --- | --- | --- |
| 1 | Is a sign-up confirmed at once? | Yes, with a setting for theatres that vet |
| 2 | What gives authority on the night? | Two facts now; duty-level abilities later |
| 3 | How wide is the shift window? | 30 minutes before call to 60 after the end; a lead can extend |
| 4 | Are checklists their own thing or forms? | Their own |
| 5 | Incident records of people with no account, and how long they are kept | As designed; three years, 21 where a child is involved, both settings |
| 6 | Must people check in? | No |
| 7 | Is the backstage board in the first release? | No |
| 8 | Shifts not tied to a performance | Supported, without on-shift authority |
| 9 | What does the night report email contain? | Numbers and a link; never incident detail |
| 10 | Who may report an incident? | Any member, on shift or not |

## 1. Is a sign-up confirmed at once?

**Options.** (a) Automatic: a member who signs up for a free place has it. (b) A manager confirms every sign-up. (c) A setting, default automatic.

**Recommendation: (c).** A volunteer theatre fills rotas by making it easy; a wait for approval loses people. Requirements on a duty already keep unsuitable sign-ups out. Theatres with vetting duties turn the setting to manager.

## 2. What gives authority on the night?

**Options.** (a) Two facts: on shift, and leading the shift, set by one tick on the duty. (b) Each duty carries its own list of abilities.

**Recommendation: (a) now, (b) later as FH-37.** Two facts cover what Box office and Interface asked for and are easy to explain: "stewards can scan; whoever is duty manager runs the night". Duty-level abilities are more exact but need a mapping screen and Identity's later story ID-26 in full. Nothing in (a) has to be undone to add (b).

**What it costs.** Under (a), everyone on shift gets the same authority, so a theatre that wants only the box office duty to scan would wait for (b) or use a role.

## 3. How wide is the shift window?

**Recommendation.** Opens 30 minutes before call time; closes 60 minutes after the shift's scheduled end; both are settings; whoever is leading can extend in half-hour steps on the night. This is the value UI-05 was waiting for.

**Why not wider.** The window is authority to scan tickets and see the house. An hour after is enough for clearing up and the report; a show that overruns is what "Extend tonight" is for.

## 4. Are checklists their own thing or forms?

**Options.** (a) Own tables. (b) Each checklist is a form in the form builder.

**Recommendation: (a).** A checklist is filled by several people at once, item by item, on phones with no signal, and each item needs who and when. A form is one person's response. Building checklists on forms would bend the form builder and tie front of house to it. The form builder is still offered a slot for a theatre's extra incident questions (FH-41).

## 5. Incident records of people with no account, and how long they are kept

An audience member who falls has no account. Foundations has ruled how such a person is stored: name and contact in classed columns, found and redacted by staff on request, listed as a manual step on the data-request screen.

**Recommendation.** Accept that, with defaults of three years after closing, and 21 years where a child was involved. Both are settings with a note that the period is the theatre's decision. Welfare details are encrypted, never emailed, and cleared at once on erasure.

**For you to weigh.** Three years matches the usual limit for an adult's injury claim in England and Wales, and the longer period follows the same reasoning for a child. I am not a lawyer and this is not legal advice: NNT's insurer or the Students' Union may set different periods, and the settings allow that.

## 6. Must people check in?

**Options.** (a) Optional: the fact holds from the window opening; check-in is a record. (b) Required: no authority until checked in.

**Recommendation: (a).** With (b), a steward who forgets cannot scan and the queue at the door grows while they find the lead. The lead confirms who worked at sign-off, so the record of attendance is still made.

## 7. Is the backstage board in the first release?

**Recommendation: no (FH-36, later).** The first release records the six timings front of house cares about. The half, the quarter, the five and beginners, with clearance between stage management and front of house, is a second live screen with its own users and deserves its own design with a stage manager.

## 8. Shifts not tied to a performance

Get-ins, strikes, open days, socials.

**Recommendation.** Support them in the first release for sign-up, reminders and hours, since theatres will want one rota. They confer rostered only: there is no performance to scan or run, so there is nothing for on-shift to authorise.

## 9. What does the night report email contain?

**Options.** (a) The whole report in the email. (b) Headline numbers and a link. (c) A link only.

**Recommendation: (b).** Attendance, start and finish times, exceptions and incident counts, then a link. The detail of any incident stays behind sign-in and the incident ability. Email is forwarded and kept for ever; an injured person's story should not travel that way.

## 10. Who may report an incident?

**Options.** (a) Any member-side person, at any time. (b) Only people on shift.

**Recommendation: (a).** Near misses are noticed in rehearsals and workshops as much as on show nights, and a safety culture depends on reporting being open. Audience members do not report through the platform in the first release; staff record it for them.

## Settled with other specifications

Recorded for the build. None is open.

- **Requirements on a duty: core's point.** Foundations ruled on 16 November that every per-person condition goes through one core point, `core.requirement`. Front of house declares no point of its own for it; parts 2 to 5 are written to the ruling.
- **Communications.** It expects front of house to contribute audience sources such as "people on this week's rota". Added as FH-46, later.
- **The on-shift bar's point.** Interface has confirmed `core.on-shift-bar`, and ruled that the board appears on screen as the Front of house section of Tonight, with tiles naming abilities, not facts.
- **Core's event names** for a performance moved or cancelled are confirmed and written into part 4.

## Changes approved on 21 November 2026

Matt approved these nine changes from the interface review on 21 November 2026. Each is written into the part named.

1. **One performance tonight opens its board.** The list of tonight's performances is skipped when there is exactly one (part 5, "Live mode").
2. **The incident report is one page**, not steps, with "Send the report" always in reach (part 5).
3. **A checklist starts with its first answer.** There is no "Start this checklist" (part 5; part 3, "Checklists", rule 1 already allowed it).
4. **Shifts is one page with "My shifts" and "Open shifts" tabs** (part 5, "Members' area").
5. **Arriving once.** Recording a timing or entering a checklist item on your own shift checks you in (part 3, "The Tonight board"; FH-21).
6. **Archived duties, rota templates and checklists can be restored**, and archiving offers Undo instead of asking first (part 5, "Console"; FH-05, FH-24).
7. **"Who else is on" leaves out the person reading it** (part 5, "Members' area").
8. **The board has no Incidents tile** (part 5, "Live mode").
9. **Volunteer hours sits in the console's People group** (part 5, "Console").
