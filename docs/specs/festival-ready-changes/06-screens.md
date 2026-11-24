# 5. Screens

Thirteen new screens and twelve changed ones. Three are drawn below as wireframes: the door counter, the rota grid and the import preview, because each is a new kind of screen for its module. The rest follow existing patterns (list, record, settings) and Nuxt UI components; settings appear on their subject pages, never twice, as Matt ruled.

## Inventory

| Screen | Address | Shell | Who sees it | New or changed |
| --- | --- | --- | --- | --- |
| Collections | `/console/programme/collections` | Console list | `core.collection.manage`; `core.production.view` reads | New |
| Collection | `/console/programme/collections/<id>` | Console record | As above. Name, colour (with contrast preview), season, summary, image, members in order (drag with @dnd-kit/vue; keyboard move up and down) | New |
| Collection page | `/collections/<slug>` | Public | Anyone, once published. Lead, image, current members as cards, then past | New |
| Production record, Details | `/console/programme/productions/<id>` | Console record | Gains a Collections picker (searchable multi-select) | Changed |
| Production public page | `/whats-on/<slug>`, `/shows/<slug>` | Public | Gains "Part of" chips, "Also appearing in" dates, and sections contributed by `public-site.production-section` | Changed |
| Performance editor | Dialog on the production's Dates tab | Console | Gains Timed or Drop-in (radio, draft only), video address (from an allowed host) and its kind; drop-in hides doors and intervals and relabels the times "Open from" and "Open until" | Changed |
| Performance line-up | Tab "Line-up" on the performance record | Console record | `core.performance.schedule`. Ordered items, add from a production search or by name, set time, length, announced. Per-performance credits under each item | New |
| Performance public block | On the production page | Public | Drop-in reads "Open 10:00 to 17:00"; line-up listed under the date; embedded video player behind a click-to-play notice, with a Watch on link beneath, when shown (VL3, VL4) | Changed |
| Import | `/console/programme/import` | Console | `core.programme.import`. Past imports with state and Undo | New |
| Import preview | `/console/programme/import/<id>` | Console steps | Upload or pretalx address, then mapping, then the preview, then Apply | New |
| Sign-in providers | `/admin/sign-in` | Admin | Gains a Microsoft card and an "Other OpenID Connect" card, each with set-up steps, tenants or domains, and test sign-in | Changed |
| Sign-in page | `/sign-in` | Public | "Sign in with Microsoft" beside Google when offered | Changed |
| Form builder, question details | Builder | Console | A "Correct answer" section on markable questions (points, feedback), shown when the form is a quiz or has marking switched on | Changed |
| Form builder, End card | Builder | Console | Pass mark and what to show after sending | Changed |
| Form builder, transitions | Builder | Console | "Who moves it" gains "The system, when…" with a condition editor | Changed |
| Form result | `/forms/<slug>/done` | Public | Score, pass or not, and feedback per `marking.show` | Changed |
| Rota grid | `/console/front-of-house/grid` | Console | `front-of-house.shift.manage`. Days across, venues and duties down; drawn below | New |
| Crew calls | `/console/front-of-house/crew-calls` | Console list | `front-of-house.crew-call.manage` | New |
| Crew call | `/console/front-of-house/crew-calls/<id>` | Console record | Tabs: Details (dates, season, perks rules), Questions (the form, roles of its questions), Crew (who signed up, answered, shifts, hours), Perks (counts) | New |
| Perks counts | Tab "Perks" on the crew call | Console record | T-shirts by size (earned, handed out, to hand out); meals by day and need. Names behind "Show list", audited | New |
| Handouts | `/live/front-of-house/handouts/<call>` | Live | `front-of-house.handout.record`. Search a name, see what they have earned and had, one large "Hand out T-shirt (M)" or "Meal today" button | New |
| Crew questions | `/members/front-of-house/crew-calls/<id>` | Members | The person. The form, then a summary of their answers | New |
| Shift check-out | Live board, People | Live | The lead's "Shadowed" tick beside a shadowing person | Changed |
| Door counter | `/live/door/<performance>`, "Count" tab | Live | `box-office.ticket.admit`. Drawn below | New |
| Night report, Door | Section of the night report | Console | Admitted, walk-ups, peak inside | Changed |

## Wireframe: the door counter (phone, live shell)

[Diagram in the Claude Doc: Door counter · phone, live shell, Count tab]

The two buttons fill the lower half so they can be pressed without looking. For a timed performance the Out button is absent and the heading reads "Walk-ups". At capacity the number turns the warning colour and reads "Full"; taps still count (HC4). Sound stays off by default, as the door's ruling says.

## Wireframe: the rota grid (laptop, console)

[Diagram in the Claude Doc: Rota grid · laptop, console]

Each cell shows places filled of places wanted and the times; red when unfilled within `sign-up-closes`. A cell of performance shifts shows their count and opens that day's performance rotas. Clicking an empty cell offers "Add a shift here"; selecting several cells and choosing "Apply a template" makes one batch (FH-48). A right-click on a cell offers Open, Copy to other days, Cancel, as list rows do (Matt's ruling of 23 November 2026).

## Wireframe: the import preview (laptop, console steps)

[Diagram in the Claude Doc: Import preview · laptop, console steps]

Everything arrives as draft (IM1). Apply runs as a job; the page shows progress and, when done, links to the season and offers Undo while part 3's undo guard holds.
