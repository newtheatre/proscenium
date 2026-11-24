# 1. Scope

The amendment covers the shared building blocks a festival needs from modules that already exist; what only a festival needs is Festival's, and planning a programme is Programme planning's.

## In scope

| Area | In |
| --- | --- |
| Core: programme | Collections and their public page; drop-in performances; line-ups; credits for one performance; embedded video player with allowed hosts and click-to-play; programme import from a spreadsheet or a pretalx export, with a preview and undo; write services other modules call inside their own unit of work |
| Core: points | `core.person-busy` (is this person committed elsewhere then?) and `core.public-wording` (a season's public words) |
| Core: identity | Microsoft as a sign-in provider, and a general OpenID Connect provider configured in Admin, on the existing provider flow |
| Forms | Correct answers, points, feedback and a pass mark on a version; marking on the server at submission; transitions the system makes when a condition holds; a quiz template; the `core.create-production` outcome action extended to collections, credits and running time |
| Front of house | Rota grid for shifts not tied to a performance, made in batches from a rota template; crew calls holding sign-up questions answered once; T-shirt and meal counts with handouts; shadowed shifts as a Training step source; contributions to `core.person-busy` and `festival.sheet-section`; the timing event |
| Box office | Door headcount (walk-ups, in and out, inside now against capacity), offline like scanning; contributions to `festival.headcount`, `festival.told-elsewhere`, `festival.sheet-section` and `core.measure` |

## Out of scope

| Out | Where it lives |
| --- | --- |
| Marking a season as a festival, the timetable, My plan, festival wording itself, venue-day sheets, exhibitions and their works | Festival (spec 2) |
| Calls for proposals, review, the unplaced tray, the scheduling board, clash warnings, publishing a plan, the occupancy view (C-65) | Programme planning (spec 1) |
| Performer and company contacts' own view of their events | Companies (spec 3) |
| Quizzes as training steps, online lessons, routes | Training, amended (spec 14) |
| Photos and albums, including festival galleries | The shared gallery plan |
| Volunteer availability and suggested rotas (FH-38, FH-39), training checks at sign-up (FH-40), swaps (FH-43) | Already later stories in Front of house; unchanged here, though the grid is built so they slot in |
| Paid timed entry to a drop-in event | Box office already sells any performance; nothing new is needed |
| Importing people, orders or tickets | Not planned. The import is a programme only |
| A password or any sign-in held on behalf of a university | Never: the theatre signs nobody in for another body |

## What this assumes of other modules

| Module | Assumption | State |
| --- | --- | --- |
| Foundations | A new reserved address prefix `/collections` on Foundations' list (with the already served /seasons and /venues listed beside it), owned by `public-site` | To ask (Integration) |
| Foundations | Services that write add statements to the caller's unit and never commit | Settled rule |
| Festival | Declares `festival.told-elsewhere`, `festival.headcount` and `festival.sheet-section` | Agreed 23 November |
| Reports | Declares `core.measure` with shared keys performance, production, collection, space, day | Agreed via Festival, 23 November |
| Training | Declares `training.step-source`; hosts quizzes in its own slot `training.quiz` | Agreed 23 November |
| Programme planning | Owns C-65 occupancy and calls the write services named in part 4 | Agreed 23 November |
| Forms | Always on (`switchable: false`), so Front of house may call its services | Settled |

## Glossary

Words this amendment owns. Festival's public words (event, act) are Festival's, and staff screens keep these.

| Word | Meaning | Not to be confused with |
| --- | --- | --- |
| Collection | A named, ordered group of productions with a colour and its own page: a festival strand, a themed run. A production may be in several | A season: a production has exactly one |
| Timed performance | A performance people arrive for: it starts at a time. Every performance today |  |
| Drop-in performance | A performance with opening hours: people come and go between open from and open until. One per opening day | An exhibition: that is Festival's record of the works shown at drop-in performances |
| Line-up | The ordered items within one performance: the acts in a showcase, the sets at a gig | Credits: who made a production |
| Line-up item | One entry in a line-up, with a name, optional length and optional link to the act's own production |  |
| Performance credit | A credit that applies to one performance only (an understudy night, an act in that line-up) | A production credit, which applies to every performance |
| Import | One upload of a programme file, previewed, applied as a batch and undoable as one |  |
| Crew call | Front of house's invitation to crew a period (usually a festival), holding the sign-up questions and the perks rules | A shift |
| Handout | A T-shirt or meal handed to a crew member, ticked by the person handing it |  |
| Headcount tap | One press on the door counter: a walk-up in, a person in, or a person out | A scan: that is a ticket |
| Walk-up | Someone admitted without a ticket at a performance where nothing needs one, or past the tickets |  |
| Inside | People counted in less people counted out, at a drop-in performance | Admitted, which never goes down |
| Answer key | The correct answers and points of a form version, never sent to a browser before submission |  |
| Marking | What a submission scored against the answer key: score, out of, passed | Review scores, which people give |
| Automatic transition | A move the system makes on submission when a condition holds | A staff or submitter move |
| Shadowing | Working a shift alongside someone who holds the duty, as a Training step |  |
