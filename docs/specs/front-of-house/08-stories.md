# 7. Stories

Forty-seven stories, FH-01 to FH-47: 4 gate, 31 others in the first release, 12 later. Front of house is roadmap phase 4, so "first release" means the module's own first release. The gate stories are the ones Interface, Box office and Identity wait on and can be built ahead of the rest.

## Gate

| Id | Story | Done when | Needs |
| --- | --- | --- | --- |
| FH-01 | As the platform, I store a shift window on every shift, computed from the call time, the end and two settings | A shift created for a performance has all four times; changing the performance's time moves them | Foundations kit; core performances |
| FH-02 | As a steward with a confirmed shift, I am on shift for that performance from the window opening to its closing, and not otherwise | `front-of-house.on-shift` answers holds, which performance and until when; requested, released and removed assignments do not hold | FH-01; Foundations facts |
| FH-03 | As a duty manager on a lead duty, I am leading the shift; as anyone with a coming shift, I am rostered | `front-of-house.leading-shift` and `front-of-house.rostered` resolve as part 3 says; rostered opens the members' area | FH-02; Identity standings |
| FH-04 | As two volunteers taking the last place at the same moment, only one of us gets it | Concurrent sign-ups never exceed `places`; the loser is refused with `front-of-house.shift-full` | Foundations unit of work |

FH-02 unblocks UI-05 (on-shift bar and Tonight), BO-44 (scan without a role) and ID-26 (map abilities to facts).

## First release

### Setting up

| Id | Story | Done when | Needs |
| --- | --- | --- | --- |
| FH-05 | As a front-of-house manager, I define duties and rota templates, guided by a setup step | Duties and templates can be created, edited, archived and restored; the setup step is complete once one of each and an emergency card exist | Interface console; core.setup-step |
| FH-06 | As a manager, I apply a rota template to one or many performances | Draft shifts appear with default times; applying twice adds nothing twice | FH-01, FH-05 |
| FH-07 | As a manager, I publish shifts so members can see them | Published shifts are visible; draft ones are not; the event is announced | FH-06 |
| FH-08 | As a manager, I create a shift that is not tied to a performance | It can be signed up for and worked; it confers rostered only | FH-07 |

### Signing up

| Id | Story | Done when | Needs |
| --- | --- | --- | --- |
| FH-09 | As a member, I see open shifts, including why I cannot take one | The list shows eligibility reasons and remedies | FH-07; members' shell |
| FH-10 | As a member, I sign up and am confirmed at once | Confirmed assignment, a confirmation notification, the place taken | FH-04, FH-09; core notifications |
| FH-11 | As a theatre that vets its volunteers, sign-ups wait for a manager | With the setting on manager, sign-up is requested; a manager confirms or declines | FH-10 |
| FH-12 | As a manager, I put someone on a shift myself and see any eligibility warning | Assignment confirmed with source assigned; an override is audited | FH-07 |
| FH-13 | As a volunteer, I release a shift; inside the notice period my place stays mine until it is covered | Both paths of part 3 work; the notice rule is explained before I confirm | FH-10 |
| FH-14 | As a member, I take a shift that needs cover | One batch confirms me and releases them; both are told | FH-13 |
| FH-15 | As a volunteer, I am reminded before my shift | At most two reminders, never repeated | FH-10; tasks |
| FH-16 | As a volunteer, I am told when a performance I am on moves or is cancelled | Times recomputed or shifts cancelled in the event's unit of work; one notification each | FH-01; core events |
| FH-17 | As a volunteer, I see my shifts and my hours this year | "My shifts" lists coming and past shifts and a total | FH-10 |

### On the night

| Id | Story | Done when | Needs |
| --- | --- | --- | --- |
| FH-18 | As a steward on shift, Tonight is first in my menu and a bar tells me I am on shift | The module contributes to the on-shift bar and Tonight tiles; both vanish when the window closes | FH-02; UI-05 |
| FH-19 | As anyone on shift, I open the front of house section of Tonight for my performance | People, timings, checklists and incidents shown; refreshes; works on a phone | FH-18; live mode |
| FH-20 | As a duty manager, I see sold, admitted and till figures on the board | Contributed figures appear, are hidden from those without the ability, and show "unavailable" on failure | FH-19; Box office and Payments contributions |
| FH-21 | As a volunteer, I tap "I'm here"; as a lead, I mark others arrived | Check-in only inside the window; "not arrived" flag after the late setting; recording a timing or entering a checklist item on my own shift checks me in | FH-19 |
| FH-22 | As a lead, I record house open, curtain up, interval and house clear | Each timing recorded once, adjustable, audited on change | FH-19 |
| FH-23 | As a lead, I extend tonight when the show runs late | Every shift's window closes later; shown on the board; never earlier | FH-02 |
| FH-24 | As a manager, I set up checklists for before and after the show | Checklists and items edited and ordered; used items archive; an archived checklist can be restored | Interface console |
| FH-25 | As a steward, I work through a checklist on my phone, noting a problem without stopping the night, with or without signal | Entries, exceptions with reason, completion; queued writes offline; optional house-open block | FH-19, FH-24; queued writes |
| FH-26 | As anyone on shift, I open the emergency card instantly, even offline | Card kept on the device; shows its review date; health check warns when stale | Live mode |

### Incidents

| Id | Story | Done when | Needs |
| --- | --- | --- | --- |
| FH-27 | As any member, I report an incident or near miss in under a minute, offline if need be, and can see my own reports afterwards | One-page report; queued when offline; number given; reporter's limited view | Live mode; queued writes |
| FH-28 | As a welfare lead, I am told at once about a serious incident and daily about the rest | Routing by the severity setting; notifications carry no detail | FH-27; holdersOf; core notifications |
| FH-29 | As a reviewer, I add the category, the people involved and follow-up actions | People with or without an account; welfare details encrypted and read-audited; actions chased | FH-27; special data class |
| FH-30 | As a reviewer, I close an incident; a serious one needs someone other than its reporter | Closing rules and refusals of part 3; reopening logged | FH-29 |

### After the night

| Id | Story | Done when | Needs |
| --- | --- | --- | --- |
| FH-31 | As a lead, I add notes to tonight's report as the night goes | Draft report exists from the first window; notes by topic | FH-19 |
| FH-32 | As a lead, I sign off the night and the report goes to those who should read it | People resolved, snapshot compiled with contributed sections, event announced, notification sent with numbers and a link | FH-31; Box office and Payments contributions |
| FH-33 | As a manager, I add an addendum to a signed report and am chased for unsigned ones | Signed row cannot change; addenda shown; morning chase | FH-32; tasks |
| FH-34 | As a front-of-house manager, I see and export volunteer hours | List with filters and totals; export; reads audited | FH-32 |
| FH-35 | As an administrator handling a data request, I can meet an erasure or access request that touches the rota or an incident | Erasure hold while an incident is open; handler, export contributor and merge handler work; unlinked people found and redacted by staff; retention sweep runs | Identity erasure; Foundations `unlinked` |

## Later

| Id | Story | Needs |
| --- | --- | --- |
| FH-36 | As a stage manager, I run a backstage board: the half, the quarter, the five, beginners, and clearance from front of house | A design round with a stage manager |
| FH-37 | As a theatre, I give different duties different abilities on the night (the bar duty may open a till; a steward may not) | ID-26 |
| FH-38 | As a volunteer, I say when I am available and am offered matching shifts |  |
| FH-39 | As a manager, I ask for a suggested rota from availability and past hours, and adjust it | FH-38 |
| FH-40 | As a manager, I require training for a duty and the platform checks it at sign-up | Training as a provider to core.requirement; the host side is in FH-09 and FH-12 |
| FH-41 | As a theatre, I add my own questions to the incident report | Form builder slot |
| FH-42 | As a volunteer, I subscribe to my shifts in my calendar | A signed feed address |
| FH-43 | As two volunteers, we swap shifts with one tap each | FH-14 |
| FH-44 | As a duty manager, I see bar figures on the board and in the report | Bar |
| FH-45 | As a trustee, I see incident trends by category, venue and month, with no personal detail | FH-30 |
| FH-46 | As a communications lead, I write to "everyone on the rota this week" | Communications audience source |
| FH-47 | As anyone on shift, I see tonight's staging effects (strobe, haze, loud noises) and the minimum age, and whether it is a restriction, in my shift briefing and on Tonight, so I can answer the audience and apply an age restriction at the door | Core domain's later content warnings slice: guidanceFor(productionId, performanceId), vocabulary core.staging-effect, age\_min and age\_restricted. Read live, never copied |

## Order of building

1. FH-01 to FH-04, which may be pulled forward into phase 3 so that UI-05 and BO-44 are real rather than stubbed.
2. Setting up and signing up (FH-05 to FH-17).
3. On the night (FH-18 to FH-26). FH-20 waits for Box office's contributions and degrades without them.
4. Incidents (FH-27 to FH-30), which stand alone and could ship before the rota if a theatre wants them first.
5. After the night (FH-31 to FH-35).
