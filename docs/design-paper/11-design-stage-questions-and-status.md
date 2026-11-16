# Design stage: questions and status

As of 16 November 2026. This tab is the record of the first round: six specifications, 67 questions, all answered, and four proofs, all passed. The second round of six more modules has its own tab, "Second round: questions and status", and every question there is answered too.

## How to answer

Every specification is already written to its recommendation, so "as recommended" for everything is a complete answer and changes nothing. Type in the Decision column only where you want something different, or write "all as recommended" at the top of a table. Each code points at the source: I is Identity, C is Core domain, B is Box office, F is Form builder, U is Interface, and the number is the question's number in that specification's "9. Questions for Matt" tab, where the full options and reasoning sit.

D is Foundations, whose seven questions have their own table below. One of them, D5, sits beside B1 as something only you can do: together they unblock the two remaining proofs.

**Answered so far:** all nine Core domain questions (C1 to C9) all seven Foundations questions (D1 to D7), all twelve Identity questions (I1 to I12, each as recommended) and all eleven Box office questions (B1 to B11, as recommended except B6, where self-service cancellation is built in the first release), which you closed on 16 November. C1 and C3 in the table below are settled as recommended, and C7 and C9 as you decided differently. All ten Form builder questions (F1 to F10) are also closed, each as recommended. All nine Interface questions (U1 to U9) are closed as recommended too. Every question on this tab is now answered, and nothing here waits on you. Where a Decision cell below is blank, the answer is "as recommended".

## Where each specification stands

| Workstream | Specification | State | Still open |
| --- | --- | --- | --- |
| 1. Foundations | [Foundations](https://claude.ai/artifact/RKRTkLkrG98jXHSBptUc1x) | Complete. Formats agreed with all five other workstreams. Proofs passed: owned paths over four releases, local tests on Linux, one-step deploy locally | All seven questions answered. The one-step deploy proof is complete: the button created every resource with nothing typed. A copy made by the button needs linking to upstream once, which is a new story |
| 2. Identity | [Identity](https://claude.ai/artifact/BcVS8iNe7oDZCPmW4gyus5) | Draft complete | All twelve questions answered, as recommended |
| 3. Core domain | [Core domain](https://claude.ai/artifact/Qt8cFSyEekr7tfpiMCqe2E) | Draft complete | All nine questions answered. Its data tables are being rewritten into the Foundations layout |
| 4. Box office, payments, finance | [Box office](https://claude.ai/artifact/MUbXSQbs4vQKMyvxZL44Po) | Draft complete | All eleven questions answered. The last-seat proof is complete: 11 of 11 cases passed on a deployed D1 database over 20 rounds each, while the unprotected control oversold in 19 of 20 rounds |
| 5. Form builder | [Form builder](https://claude.ai/artifact/6E5k2VS2PnhdciVNMeap5s) | Draft complete | All ten questions answered, as recommended. Payment on a form waits for Box office and is outside the first release |
| 6. Interface | [Interface](https://claude.ai/artifact/KwZ3oXcFJSMNj98kNc9ywW) | Draft complete, aligned with Identity | All nine questions answered, as recommended. The [clickable prototype](https://claude.ai/artifact/CRHCxGx74xquxnRa6qVi4C) of the buy, desk and door journeys exists, as a throwaway to judge feel |

## Start here: the thirteen that shape the most

| Code | Question | Recommendation | The main alternative | Decision |
| --- | --- | --- | --- | --- |
| B1 | Run the last-seat proof on a real D1 database? | Yes, in your personal Cloudflare account: one throwaway database and Worker, deleted afterwards | In the New Theatre account, or leave it as the first task of the build |  |
| I1 | Does buying as a guest create an account? | Yes, an unclaimed one that the buyer claims by signing in later with the same address | Guest orders hold only an address and are never linked |  |
| I2 | What opens the members' area? | Any standing: a role marked as opening it, or a fact a module marks as a standing, such as a current membership or a place on a production team | Only a paid or verified membership, or a switch staff set |  |
| I3 | What does somebody without a standing see at a members' address? | "Page not found", exactly as for a missing page | "This is for members", with a way to join |  |
| U3 | Where does an audience member's account live? | Inside the public site, as My account, with no member furniture at all | Its own fourth area, or the members' area with parts hidden |  |
| C1 | Does core know whether a performance is on sale? | No. Core says a performance exists and is public; Box office says whether, when and to whom it sells | Core holds "on sale", as Proscenium does |  |
| B2 | Which payment providers ship first? | Cash and attested card always, then Stripe online, then the SumUp reader | Stripe for everything, or SumUp for everything |  |
| B5 | Who approves a refund? | Two different people, except at or under a limit that ships at zero and a theatre may raise | One person with the ability |  |
| B9 | What goes first if the first release must shrink? | The cut order in Box office's tab 9: waiting-list offers, unpaid phone holds, promo codes, offline scanning, member pricing, the SumUp reader, statements and export | A different order |  |
| F1 | Does review ship in the form builder's first release? | Yes: stages, private scores, conflict lockout and decisions. Without it the form builder cannot run a proposals round | Forms and simple stages first, review later |  |
| U2 | Do addresses name the shell first or the subject first? | Shell first, such as /members/shifts and /console/box-office/orders, so a theatre's own page can never collide with a platform page | Subject first, as Proscenium does |  |
| C3 | How far does in-app branding go? | Name, one colour, a grey tone, heading font, corner roundness, logos for light and dark, social image, email header and default mode | Flytower's shorter list, or a full theme editor |  |
| U9 | What should the next round of wireframes be? | A clickable prototype of the three box-office journeys (buy, desk, door) in a sample theatre's branding | More static drawings, or nothing until the build |  |

## Foundations

| Code | Question | Recommendation | The main alternative | Decision |
| --- | --- | --- | --- | --- |
| D4 | Where does the Windows and macOS test proof run? | You create an empty public repository for the new platform, and the proof runs on its CI | Leave the proof at Linux only until the build starts | Decided by your comment in the Foundations document: no Windows or macOS test runs. Linux is the supported system for tests, locally and in CI. The local-tests proof is closed as passed. |
| D5 | Make one real deploy to close the one-step deploy proof? | Yes, on your personal Cloudflare account, not the New Theatre account | Leave it for the build | As recommended. The deploy check is being arranged |
| D1 | What scope do settings have? | Site-wide only | Settings that vary by venue or production | As recommended |
| D2 | How does a theatre receive a release? | An update pull request opened in its own repository | Manual only, or fully automatic | As recommended |
| D3 | How do migrations run after an update? | By a button, with automatic as a setting | Always automatic | As recommended |
| D6 | What form do record ids take? | Sortable text ids | Counting numbers | Decided by your comments in the Foundations document: scoped ids as in Flytower's platform, a short table prefix then 26 characters, such as ord\_01jd3k, sortable by creation time. |
| D7 | What does upstream promise forks? | Nothing breaks within a major version, and at most one major version a year | A looser or stricter promise | Decided by your comment in the Foundations document: no promise before version 1.0. From 1.0, nothing breaks within a major version, at most one major a year, and the previous major gets six months of security fixes. |

## Accounts and sign-in

| Code | Question | Recommendation | The main alternative | Decision |
| --- | --- | --- | --- | --- |
| I4 | Are passwords offered? | Not in the first release. A sign-in method is a declared point, so one can be added | Never, or from the start |  |
| I5 | Does a Google sign-in count as strong enough for privileged work? | A setting, off by default, for a managed domain whose provider enforces two-step sign-in | Never, or always |  |
| I6 | Which ways back in exist after a lost passkey? | Recovery codes, a single-use enrolment link from staff, and an Owner break-glass that works only while a deployment secret is set | Recovery codes only, or no break-glass |  |
| I7 | Is the emailed sign-in a link, a code, or both? | Both in one email; the code works only in the browser that asked | Link only, or code only |  |
| I8 | How long can a merge be undone? | 30 days, a setting | Not at all, or for ever |  |
| I9 | Can a person merge their own two accounts? | Yes, after signing in to both, in a later release. Staff merge covers the first | Staff only, or in the first release |  |
| I10 | How does self-requested erasure run? | Automatically after a 7-day cooling-off unless a module holds it | Always reviewed by staff, or immediately |  |
| I11 | May a managed domain's addresses also sign in by emailed link? | No: the provider only, and a role can require a managed identity | Yes, either way |  |
| I12 | Are the defaults right? Signed in 30 days or 14 unused; fresh proof lasts 10 minutes; link and code last 15 minutes; unclaimed accounts anonymised after 3 years and dormant claimed ones after 2, both off until armed | Yes as starting values. All are settings | Other values |  |

## Programme, public site and notifications

| Code | Question | Recommendation | The main alternative | Decision |
| --- | --- | --- | --- | --- |
| C2 | Can a production belong to more than one season? | No: one, or none. A festival or strand is a category or a content page | Several seasons, or seasons inside seasons | As recommended |
| C4 | Where do the public menu and footer links live? | In a file in the fork, site/content/navigation.yml | An in-app menu editor | As recommended |
| C5 | Are credits public, and what happens on erasure? | Public by default; a person can hide their own; on erasure the link goes and the printed name stays unless they ask | Opt in, or staff decide | As recommended |
| C6 | Is phone push in the first release? | No. Email and inbox first; push can arrive with front of house | All three at once | As recommended |
| C7 | What is a production's permanent address? | /whats-on/\<slug> | /shows/\<slug>, or /\<year>/\<slug> | Decided by your comment in the Core domain document: /whats-on/\<slug> while current and /shows/\<slug> once past, redirecting between the two, with a setting for whether past shows are public. |
| C8 | One language for production text at first? | Yes, with the interface translatable from day one | Multilingual production text from the start | As recommended |
| C9 | Do team alerts to Discord or a webhook belong in the first release? | No. Later, through the channel point | First release | Decided by your comment in the Core domain document: outgoing webhooks are in the first release, owned by core. A webhook carries only the event name, time, ids and the record's public title. |
| U6 | Does the public site offer dark mode? | It follows the device, and a theatre can pin it light | Always light, or always follows |  |

Core domain also proposes these defaults, which need only a nod: the operating day rolls over at 04:00, doors open 30 minutes before, a deleted file can be restored for 30 days, the delivery log is kept 400 days and inbox messages 180, a message is tried 5 times, "Powered by Proscenium" shows in the footer until a theatre turns it off, and open programme data and the calendar feed are on.

## Box office, payments and finance

| Code | Question | Recommendation | The main alternative | Decision |
| --- | --- | --- | --- | --- |
| B3 | Connect providers inside the app, or by secrets only? | Secrets only in the first release, guided by setup | "Connect with Stripe" in the app | Decided by your comment in the Box office document: secrets only in the first release, with connecting inside the app supported later as the friendlier option. |
| B4 | When does ticket money become income? | When the performance takes place | When the ticket is sold | As recommended, as one fixed rule. The setting is removed |
| B6 | May buyers cancel or exchange their own tickets online? | Off by default, and built after the first release | In the first release, or never | Decided by your comment in the Box office document: built in the first release, off by default. |
| B7 | Is there a booking fee by default? | None. A theatre may set one, and it shows from the first basket | A default fee sized to cover card costs | As recommended |
| B8 | May the door admit people while offline? | Yes, on by default. A double admission is detected and flagged afterwards | Off by default | As recommended |
| U7 | How is checkout laid out on a phone? | Short steps (tickets, details, pay) with the total always visible | One long page |  |
| U8 | How are allocated seats chosen on a phone? | Best available by default, with "Choose my own seats" opening the plan | The plan first |  |
| B10 | Are unclaimed reservations released automatically? (New: "reserve now, pay on arrival", added after your question about theatres with only an in-person card reader) | Yes, with the timing a setting | Staff release them by hand | As recommended |
| B11 | Must a buyer confirm their email before a reservation holds seats? | Yes, as a setting that ships on | No confirmation needed | As recommended |

## Form builder

| Code | Question | Recommendation | The main alternative | Decision |
| --- | --- | --- | --- | --- |
| F2 | Does an approved proposal create its production automatically in the first release? | Later. The decision is recorded and someone creates the production by hand | An outcome action creates it in the first release |  |
| F3 | May people who are not signed in fill in a form? | Yes, where the form's author allows it, behind Turnstile and rate limits | Never |  |
| F4 | May a form ask special-category questions, such as access needs? | Yes: encrypted, a separate ability to read, each view audited, signed-in respondents only by default | Not in the first release |  |
| F5 | Who may change a response after it is submitted? | The author chooses per placement; the default is only when staff return it | Always until closing, or never |  |
| F6 | How are calculated values written? | Picked from functions first, a typed formula later | Typed only |  |
| F7 | Which built-in records get custom fields first? | Production, person and venue | Those plus performance, space and ticket type |  |
| F8 | Must a form state how long answers are kept before it is published? | Yes where it asks for personal data. Templates suggest a period, and the platform ships no default | Ship a default period |  |
| F9 | Can a reviewer's scores and comments reach the applicant? | Never through the platform; only the decision and the message written for them | The theatre may release anonymised comments |  |
| F10 | Should forms be portable between theatres? | Yes, by export and import and community templates, after the first release | Export and import only, or neither |  |

## Interface

| Code | Question | Recommendation | The main alternative | Decision |
| --- | --- | --- | --- | --- |
| U1 | Is the show-night surface a fourth shell, or a mode inside three? | Three shells plus a live mode with no navigation | Four shells |  |
| U4 | What do members navigate with? | A top bar, with a bottom tab bar on a phone | A sidebar like the console's |  |
| U5 | Should the console work fully on a phone? | Yes, every screen, designed on a laptop first | Laptop only |  |

## Notes from integration

- **B4 is the one place a draft and its recommendation differ.** Box office recommends recognising income when the performance takes place, but its part 6 drafts this as a setting. I recommend the fixed rule: one path to test, and a theatre that wants sale-date figures can read them from a report.
- **C3 and U6 overlap.** The default mode in branding and the public site's dark mode are one control. Answering U6 settles both.
- **I1, U7 and F3 agree.** Guest checkout is the default path, a guest purchase makes an unclaimed account, and a signed-out form response is keyed to its email address and found again once that address is verified.
- **C1 is already agreed between Core domain and Box office.** It is listed because it departs from this paper's Part A, which has since been amended to match.
- **Each specification also lists choices it made without asking**, for you to overrule: Box office (three modules, one order line per ticket, double-entry ledger, refunds only by the method that paid), Form builder (always on, one language per form, no code step in logic) and Interface (names, console group order, pages of 25, the command palette in the first release).

* **Webhooks make every event's name and ids visible outside the theatre.** Following your decision on C9, a webhook can subscribe to any event any module announces. Event payloads already carry no names or free text, and Foundations has been asked to add a flag by which a module keeps a particular event off webhooks.
* **Venues and spaces carry access features** from a set vocabulary with icons, also decided by your comment in the Core domain document.

- **One payment can cover tickets and something else.** You asked that one card-reader transaction be able to take tickets with drinks and snacks. Payments now supports it: a payment has one or more parts, each owned by a module, settled together and refunded and posted to the ledger separately, and another module adds lines at the desk through the point payments.desk-basket. The Bar specification, written in the second round, is the first to use it, and ten of its stories join roadmap phase 3 for that reason.
- **"Reserve now, pay on arrival" is in the Box office specification**, which you approved: a reserved order claims seats as a sale does, takes no payment and issues no tickets until the desk is paid, and always belongs to an account. B10 and B11 above are its two open choices.

## What happens after your answers

Done since: the answers are folded into the six specifications and this paper, the shared glossary and the build backlog exist, and the second round of specifications (Front of house, Spaces, Bar, Training, Membership, Communications) is written and decided. The foundation kit and phase 1 are being built.
