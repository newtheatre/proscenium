# Second round: questions and status

bothSix more modules were specified on 16 November 2026, alongside the kit build. Each specification is its own document with a build backlog and a questions tab. This tab gathers every question that needs your word. As in the first round, saying "happy with the recommendations, except..." is enough; each thread builds on its recommendation meanwhile.

**Status at 16:20 GMT on 16 November 2026: every question on this tab is answered.** Each section below opens with what was decided, and where a decision differs from the recommendation the note says so. The differences are: named bar tabs in the first release (staff tabs and floating tabs); room bookings in the student-society preset all need approval except maintenance; a member price is checked at purchase and again at entry, and a typed reference may stand in for signing in; and no mailings in the first release, because Cloudflare's email service is for transactional email only. The questions are kept as asked, for the record.

## Status

| Module | Specification | Stories | Tables | Questions |
| --- | --- | --- | --- | --- |
| Front of house | [Front of house](https://claude.ai/artifact/6F8QhPq1EFKUabiJTB1dxA) | 46 (4 gate, 31 first release, 11 later) | 17 | 10 |
| Spaces (room booking) | [Spaces](https://claude.ai/artifact/XEW9gcTLL4gMfgWeXaFrks) | 48 (4 gate, 32 first release, 12 later) | 7 | 9 |
| Bar | [Bar](https://claude.ai/artifact/QBYi2Dci21MVDj2CTuqvQK) | 44 (34 first release including 8 gate, 10 later) | 20 | 9 |
| Training | [Training](https://claude.ai/artifact/Sit2qCdVGgB6BvGhDdREga) | 34 (24 first release, 10 later) | 12 | 10 |
| Membership (two modules) | [Membership](https://claude.ai/artifact/2drDXf3PoCgPgXJXREBF5T) | 55 (42 first release including 9 gate) | see the specification | 11 |
| Communications | [Communications](https://claude.ai/artifact/377kofYbMZFHNDxMCaddYQ) | 38 (6 gate, 18 first release, 14 later) | 9 | 10 |

The cross-module requests these six made of the first-round workstreams (Identity, Core, Box office and Payments, Form builder, Foundations) have been ruled on between the threads and written into the specifications. The last one closed on 16 November: a screen's shell follows whose business it does, never what guards it, so a trainer's own sessions and a holder's own bar tab sit in the members' area, and acting for the theatre sits in the console.

## Four questions that cut across modules

These come first because more than one module depends on the answer.

|  | Question | Recommended | Main alternative |
| --- | --- | --- | --- |
| X1 | When is the bar built? You asked for tickets and drinks in one card-reader payment. | Ten bar stories (prices, the till, the desk panel, income) join phase 3 straight after Box office's desk stories; the rest of the bar follows in the next phase. | All of the bar after phase 3, with NNT keying drinks as an attested amount meanwhile. |
| X2 | When someone is not trained for what they are about to do (a shift, a bar opening, a room or resource), does the platform refuse or warn? | Refuse, naming what is unmet, with an audited override held by whoever runs the night or manages the rota, never for oneself. Front of house, Bar and Spaces all assume this. | Warn only, as a setting on each host. |
| X3 | When someone's training lapses, are they taken off future shifts automatically? | No. Tell the person and the training manager, show the shift as unmet, and check again at shift start. | Automatic removal. |
| X4 | Membership's online joining rests on three form builder stories now listed as later (FB-501, FB-502, FB-506). Bring them forward with Membership as the first module to host a form? | Yes, splitting FB-506 into its general mechanism and the "creates a production" action, which stays later. | Build Membership's online joining after them; staff add members by hand until then. |

## Front of house

**Answered, 16 November 2026.** Matt accepted all ten recommendations, so the "Recommended" column below is decided. That settles X2 and X3 as far as front of house goes: a member's own sign-up is refused when a requirement is unmet, a manager may assign with an audited override, and nobody is removed automatically when training lapses. X2 and X3 stay open for Training, Bar and Spaces.

|  | Question | Recommended | Main alternative |
| --- | --- | --- | --- |
| FH1 | What gives authority on the night? | Two facts, on shift and leading the shift (one tick on the duty) | Each duty carries its own abilities (later story FH-37) |
| FH2 | How wide is the shift window? | Opens 30 min before call, closes 60 min after the shift's end, both settings, a lead can extend | A wider fixed window |
| FH3 | Must people check in to have authority? | No; check-in is only a record and the lead confirms who worked at sign-off | No authority until checked in |
| FH4 | Checklists | Own tables | Built on the form builder |
| FH5 | Is a sign-up confirmed at once? | Yes, with a setting for manager confirmation | Manager confirms always |
| FH6 | Incident people with no account, and retention | 3 years after closing, 21 where a child is involved, both settings, not legal advice | The theatre must set periods before use |
| FH7 | Who may report an incident? | Any member, on shift or not | Only people on shift |
| FH8 | Night report email | Headline numbers and a link, never incident detail | Whole report in the email |
| FH9 | Shifts not tied to a performance (get-ins, socials) | Supported for sign-up, reminders and hours, giving rostered only | Leave out of first release |
| FH10 | Backstage board (the half, beginners, clearance) | Later | First release |

## Spaces (room booking)

**Answered, 16 November 2026.** Matt accepted every recommendation, so the "Recommended" column below is decided, with one difference on who can book: any member may ask, but in the student-society preset every purpose except maintenance needs approval, because NNT's Theatre Manager decides each request and also places requests for externally managed rooms. For Spaces this also settles X2: an unmet training requirement refuses, with an audited override.

The first three shape the module.

|  | Question | Recommended | Main alternative |
| --- | --- | --- | --- |
| SP1 | Does a room booking request waiting for approval keep the time? | No, only a confirmed booking occupies time and the approver sees rival requests side by side | Requests keep the time, first come first served, and expire if undecided |
| SP2 | Can a higher-priority booking displace a lower one? | Yes, but only through an approver, with 48 hours' notice (a setting), and one switch turns it off | Only performances and closures ever displace a booking |
| SP3 | Paid hire and requests from the public? | Later, as its own specification on forms, payments and finance; meanwhile staff enter hires | In the first release |
| SP4 | Who can book out of the box? | Every member; meetings confirmed at once, socials and workshops need approval, rehearsal purposes only for a production's team | Everything needs approval at first |
| SP5 | Rooms that combine or divide, and resources with a quantity? | Later; each bookable is one thing with one diary | In the first release, which changes the clash rule that must be proved |
| SP6 | What do members see of each other's room bookings? | The purpose only by default, theatre may turn on title and name (Identity's caution) | Names on from the start |
| SP7 | Do no-shows have consequences? | None automatic; approvers see the count | Automatic approval is lost after repeated no-shows |
| SP8 | When a performance or closure that bumped someone goes away, are they offered the time back? | No, not in the first release | Offer it to the bumped person |
| SP9 | Menu name? | "Room bookings", module id stays spaces | "Spaces" |

## Bar

**Partly answered, 16 November 2026, by Matt's comments on the Bar specification.** BAR2 is decided as recommended (NNT sells wine by the glass); only whether draught beer is sold remains to be told. BAR4 is decided the other way: named bar tabs are in the first release, and the specification now carries them (46 stories, 37 in the first release). Two follow-ups replace BAR4. May a bar tab run across several nights? Assumed no, with a setting to allow it. Should money owed on a tab show in the accounts before it is paid? Assumed no, with income posted when the tab is paid; the alternative needs a debtors account from Finance.

**Three more answers the same day.** BAR6 is decided as recommended: income only now, stock value and the rest later. BAR7: NNT needs the standard premises licence refusals log, so the register now records the product refused and a manager's periodic signature, with an optional description of the person that is off by default; the follow-up is whether NNT's licence conditions need that description. BAR9: committee members get 25% off, so a price list can be a percentage off the standard one, chosen by hand at the till and guarded by an ability; the follow-up is whether it covers everything or only some categories (assumed everything). Still open for the bar: X1, BAR3, BAR5, BAR8, the two bar tab follow-ups, and whether draught beer is sold.

**Bar tabs, decided the same day.** There are two kinds. A staff tab belongs to an account holder given the ability to hold one (NNT's committee); the holder adds to it themselves from a "My bar tab" screen at a self-service outlet on their own mobile device, and it runs across nights up to a limit. The bar may display a QR code linking to that screen; the code is the theatre's own convenience and the platform does not require one. A floating tab is opened by bar staff under a name (a director covering the cast), only staff add to it, and it must be paid before the outlet closes. That answers the first bar tab follow-up above. Three assumptions now wait in its place: self-service leaves out alcohol unless a setting allows it; a staff tab is paid whole at the till, with online payment later; and money owed stays out of the ledger until paid, shown in a "Bar tabs owed" report. The bar is now 48 stories, 39 in the first release.

**All bar questions closed, 16 November 2026.** Matt accepted the remaining recommendations and assumptions. X1 is decided: the ten bar stories join phase 3 straight after Box office's desk stories, and the rest follow in the next phase. Stock never blocks a sale, offline cash sales come later, and the student-society preset lets the box-office role sell drinks at the desk outlet. On bar tabs, self-service leaves out alcohol, a staff tab is paid whole at the till, and money owed stays out of the ledger until paid. The refusals log keeps the description of the person off, and the committee price list is 25% off everything.

BAR1 is X1 above.

|  | Question | Recommended | Main alternative |
| --- | --- | --- | --- |
| BAR2 | How deep is stock in the first release? | Whole units and simple measures (a can, 568 ml of a keg) | Things sold whole only; full recipes later |
| BAR3 | Does stock ever block a sale? | No; levels may go below zero and the shortfall is shown | Refuse when the level is zero |
| BAR4 | Bar tabs? | Parked sales now (set aside, recalled the same night), named bar tabs later | Bar tabs in the first release, adding customer data and debts to chase |
| BAR5 | Selling offline? | Later; offline the till says payments need a connection | Cash sales queued on the device in the first release |
| BAR6 | How much of the bar is in the ledger? | Income only, by category | Stock value, cost of sales, wastage and variance too |
| BAR7 | Age check? | One prompt per sale with a restricted product; outcome, staff and time recorded, nothing about the customer; 18 and 25 as settings | None offered; it turns on the fact asked below |
| BAR8 | Who sells drinks at the desk? | The student-society preset gives the box-office role bar.sale.sell on the desk outlet | Every theatre grants it by hand |
| BAR9 | Staff and member prices, training? | Price lists chosen by hand now, an ability guarding restricted ones; automatic member prices later; a training requirement per outlet in first release | None offered; it turns on the fact asked below |

BAR7 and BAR9 also ask for facts: does NNT's licence need a refusals log in a set form, and does NNT have staff or member prices at the bar today?

## Training

**Answered, 16 November 2026.** Matt accepted all ten recommendations, so the "Recommended" column below is decided. That closes X2 and X3 everywhere: an untrained person is refused, naming what is unmet, with an audited override; nobody is taken off future shifts automatically when training lapses. Front of house, Bar and Spaces already assume exactly this, so nothing changes in them.

TR6 and TR10 are X2 and X3 above.

|  | Question | Recommended | Main alternative |
| --- | --- | --- | --- |
| TR1 | Should other modules require competencies or courses directly? | Competencies, with a same-named competency offered when a course is created | Courses directly, dropping two tables |
| TR2 | Who can take training in the first release? | Members only, with staff able to add anybody by name | Induction courses open to any signed-in person |
| TR3 | How are criminal-record checks (DBS) held? | As "seen" only: who saw it, when, and when to look again; no file, number or content | Allow files as for first aid |
| TR4 | How long is training history kept? | Three years after a training record ends, then anonymised; evidence files 90 days; attendance two years; all settings | Delete everything on erasure |
| TR5 | May members send in their own certificates? | Yes by default, counting only once a verifier other than themself accepts | Staff entry only |
| TR7 | Default when a course's material changes? | Author chooses each time, "training records stand" pre-selected, 28 days' grace when retraining is required | Retraining pre-selected |
| TR8 | Default validity, and does early renewal keep the old date? | Two years (one in the student-society preset), per course; renewal in the last 60 days runs from the old expiry | Renewal runs from the renewal date |
| TR9 | Must marking attendance work offline in the first release? | No; a later story (TR-31) | Bring it forward on Interface's live mode |

## Membership

**Partly answered, 16 November 2026, by Matt's comments on the Membership specification.** MB3, MB5, MB7, MB8 and MB10 are answered and the specification is on its second draft (58 stories, 49 in the first release). The answers that reach other modules: a member price is checked at purchase and again at entry; a signed-out buyer may type a reference (for NNT, a student ID) to get the member price without an account, with the check at entry as the safeguard; the membership card is in the first release and scans on the front of house screen; and custom fields about members are wanted from the start, so FB-503 joins FB-501, FB-502 and FB-506 in X4. One scheme can now be held for several lengths at a price each. Still needed from you: whether NNT's "1 year" is the academic year or 12 months from purchase, and whether the students' union can supply a list. The specification's own questions tab is the current list for the rest.

**All Membership questions closed, 16 November 2026.** Matt accepted the rest as recommended: two modules, supporters' schemes in the first release, a fee is income in full on the day paid, no grace unless a scheme sets it, and membership officers and box office staff may take a fee in a till session. X4 is decided: the four form builder stories come forward with Membership as their first host (FB-501, FB-502, FB-503 for the membership record only, and the mechanism half of FB-506). A reference accepted in place of signing in is a setting per scheme, off by default. In Matt's own words: NNT memberships run a rolling 12 or 36 months, the students' union supplies a CSV of names, IDs and end dates, and whether a holder may end their own membership is a setting.

MB11 is X4 above. Membership is two modules, `membership` and `membership-fees`, which is itself question MB1. A fee counting as income when paid does not conflict with your ruling that ticket income is recognised at the performance: that rule binds tickets only.

|  | Question | Recommended | Main alternative |
| --- | --- | --- | --- |
| MB1 | One module or two? | Two, membership and membership-fees, so a free member list needs no Payments | One module requiring Payments and Finance |
| MB2 | Supporters' schemes (never open the members' area) in the first release? | Yes | Members' schemes only, option hidden |
| MB3 | Which verifiers ship first, and how does NNT verify today? | Staff, email domain, uploaded list | Staff only. This one needs your facts on NNT and the students' union |
| MB4 | When is a fee income? | In full when paid | Spread over the months covered |
| MB5 | Member price judged at purchase or on the night? | At purchase (or reservation) | Must be a member on the night |
| MB6 | When a membership runs out? | Members' area goes at once; grace per scheme, 0 for societies, 30 days for amateur companies | A site-wide grace |
| MB7 | Member numbers? | Yes, one per person for good, never reused | None |
| MB8 | May a member end their own membership? | Yes, no automatic refund; refunds by staff | Staff only |
| MB9 | Who takes a fee at the desk? | Membership officers and box office staff in a till session; waiving is privileged | Membership officers only |
| MB10 | Is the first-release list right? | As tab 1 (42 stories, 9 gate) | Add bulk import, then custom member fields |

## Communications

**Answered, 16 November 2026.** Matt accepted every recommendation, so the "Recommended" column below is decided, and COM11 further down is decided as B. Nothing in Communications waits on him. Two proofs run with the core's notifications in phase 2: a tranche of notifications recorded in one D1 batch, and bounce and complaint events from Cloudflare reaching a Worker with the message id.

The first four shape the module.

|  | Question | Recommended | Main alternative |
| --- | --- | --- | --- |
| COM1 | Two kinds of message, mailings to a list and notices to people chosen by what they hold? | Yes, both here, notices with their own ability, a reason and no promotion | Notices move to box office and each module grows its own |
| COM2 | May a theatre email recent ticket buyers who were offered an opt-out but ticked nothing? | Build it, off by default; not legal advice | Drop the existing-customer basis and COM-30 |
| COM3 | Track opens and clicks? | No opens ever; aggregate click counts later | Click counts in the first release, or never |
| COM4 | Double opt-in for public sign-up? | On by default, a setting, off when signed in or at checkout | Off by default |
| COM5 | Second person approves each mailing? | A setting, off by default | On by default, COM-31 in the first release |
| COM6 | Email only at first (plus inbox for members), texts later? | Yes | A text channel as a core story with a paid provider |
| COM7 | May staff import an existing list on their own recorded statement of consent? | Yes, with reconfirmation offered | Every import must reconfirm |
| COM8 | Keep consent evidence how long after someone leaves? | 6 years, a setting | Another default |
| COM9 | Run the three proofs (50 in one D1 batch, 10,000 recipients, Cloudflare bounce and volume) before the build is scheduled? | Yes | Sending defaults stay guesses |
| COM10 | May a list publish past mailings on the website? | Later, per list, off by default | Drop COM-37 or bring it forward |

**COM11, added 16 November 2026, and it touches the "entirely on Cloudflare" goal.** Cloudflare's own FAQ (dated 15 October 2026) says its Email Service "supports transactional email only" and may not be used for marketing email. A newsletter to an opted-in list is marketing, so mailings as specified cannot go through Cloudflare. Ticket emails, notices, subscription confirmations and test sends are transactional and unaffected. The choice is on a decision card in the Communications thread:

- **A (recommended).** The core's email pipeline gains a second transport for non-transactional mail. A theatre that wants mailings adds one outside provider that permits marketing; everything else stays on Cloudflare.
- **B.** No mailings in the first release. Lists and consent ship, and subscribers can be exported to whatever the theatre already uses.
- **C.** Keep the design and ask Cloudflare.

**COM11 decided, 16 November 2026: B.** There are no mailings in the first release, so the platform stays on Cloudflare alone and the core needs no second transport. Lists, consent and preferences still ship, and exporting a list (COM-26) moves into the first release, carrying consent evidence and each person's manage link so an outside newsletter tool can point back at the platform's manage page. Notices to people chosen by what they hold are transactional and stay. Communications is now 21 stories in the first release and 17 later. The proof that a 10,000-recipient mailing does not delay urgent email moves to the later release along with the core's bulk lane.

The research item this replaces is otherwise answered: Cloudflare reports bounces and complaints as events on a queue and suppresses those addresses itself, so the platform mirrors that list. Its daily sending quota starts low and grows with reputation, with no published figure, and Email Sending is still in beta.

## What integration still owes

The build backlog tab does not yet carry these six modules' stories, tables and glossary words; that is the next piece of integration work, along with the proofs Communications asks for in COM9 and the open research item on what Cloudflare Email Sending reports for bounces and complaints.
