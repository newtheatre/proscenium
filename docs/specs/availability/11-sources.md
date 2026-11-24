# Sources

Everything this spec rests on, read on 23 November 2026.

## The inspiration

| Source | What it gave |
| --- | --- |
| [CallTime home page](https://www.calltime.online/) | "A cross between Doodle and When2Meet", "designed for ongoing projects"; everyone enters availability on role calendars; the organiser selects the roles and sees overlapping busy times; an account claims several roles and updates them all at once |
| [CallTime screenshot: entering a role's availability](https://www.calltime.online/assets/calltime-production-5982a42d.png) | Half-hour rows, a role picker per production |
| [CallTime screenshot: the schedule](https://www.calltime.online/assets/calltime-schedule-37a920c3.png) | Roles ticked with "Updated 10 minutes ago" and "Updated never"; hovering a slot lists who is busy |
| [CallTime screenshot: personal calendar](https://www.calltime.online/assets/calltime-calendar-2bed4206.png) | "Select a time to change it to free or busy", whole day by clicking the date, drag to select, "used for all the roles you've claimed" |
| [Doodle](https://doodle.com/en/) and [When2Meet](https://www.when2meet.com/), as CallTime names them | The poll and the overlap grid, in general terms only |

CallTime's site renders in the browser; its help, pricing and feature pages were not found, so nothing here relies on detail beyond the home page and its three screenshots.

## The platform

| Source | Used for |
| --- | --- |
| Brief: /mnt/project-files/third-round-specs/brief.md | Format, rules, thread list |
| [Proscenium: the plan beyond what is built](https://claude.ai/artifact/Ncea8wJY5z2sdaA89cigQk) | Third-round boundaries |
| [Third round integration: rulings and status](https://claude.ai/artifact/AKm7BUp7iuRBo2g2Gdcshg) | R3-03 support modules, R3-04 (amended), R3-07 departments, R3-09 services, R3-12 calendar feed, R3-25 under-18s, R3-26 this module |
| [Rehearsals specification](https://claude.ai/artifact/KnDcgzA7Eoa1QF3bk9GCX7) | The conflicts table, rules F1 to F5, question 4, tests U-1 to U-3 and U-9, all now moved here |
| [Festival-ready changes](https://claude.ai/artifact/FfQsVzVe3MdJUKmr5Wq54N) | `core.person-busy` (C-66) contract and contributors; FH-48 rota grid |
| [Productions: specification](https://claude.ai/artifact/TaJ813JJiX2RWRyUKn64iF) | Team, `listTeam`, `productions.schedule-entry`, `productions.workspace-tab` |
| [Governance: module specification](https://claude.ai/artifact/FsJ5BaSC59qRnHBbE6x78V) | Bodies, posts, GV-23 meetings (first release since 24 November) |
| [Training (amended): specification](https://claude.ai/artifact/CnDiA4hRpvXTXonrQRCgaC) | Session target and waiting lists |
| [Programme planning: specification](https://claude.ai/artifact/95NQgdyeu2YrNH3jTpHPQf) | Entry windows (`now ppew`, W6), W7, pencils as tentative |
| newtheatre/proscenium, branch `next`: docs/specs/foundations (02-1 manifest, 02-2 settings, 02-3 abilities, 02-4 data classes) | Table, settings and ability formats |
| newtheatre/proscenium, branch `next`: docs/specs/front-of-house (data model, settings and abilities) | Tone, depth and layout |

## Agreed by message, 23 November 2026

| Thread | Agreed |
| --- | --- |
| Specify Rehearsals | Requires availability; conflicts moved; `levels()` mapping; closing never locks; Q4 moved |
| Specify Productions | Groups, schedule entries, workspace tab |
| Festival-ready changes | Contributor to C-66; `source` field; FH-48 shows levels; no Shift target; under-18 via R3-25 |
| Specify Governance | Body groups; GV-23 Committee meeting target, first release (24 November) |
| Specify Training (amended) | `training.session` target; `training.course-waiting` groups |
| Specify Programme planning | No use of availability; entry windows stay its own |
| Integrate the third round | R3-26 registered; prefixes checked free; R3-04 amended; R3-25 for under-18s |

## Decided by Matt, 24 November 2026

Matt answered the nine questions on cards between 01:03 and 01:05 (relayed through the Warwick fit thread; the cards are in /mnt/project-files/third-round-specs/questions/availability.json). Eight went as recommended. Question 6 chose calendar imports for the first release, so I1 to I6, S14, the import settings, AV-26, AV-31, AV-32 and T-AV-32 to T-AV-36 were written that morning. The Google and Microsoft scopes named in I2 are from memory of the providers' documentation and are confirmed by proof P-AV-1 before AV-31 starts.
