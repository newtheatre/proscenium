# 9. Questions for Matt

Nine questions, in the order they matter. The document is written on the recommendation in each case, so answering "as recommended" changes nothing. **All nine were accepted as recommended by Matt on 16 November 2026**, along with the smaller points below.

| # | Question | Options | Recommendation | Decision |
| --- | --- | --- | --- | --- |
| 1 | Is the show-night surface a fourth shell, or a mode inside three? | (a) Three shells plus a chrome-free live mode; (b) four shells, as today's Proscenium has | (a). A person in live mode is doing one job and needs no navigation, so a shell would be an empty frame. It keeps the paper's "three shells" true | **(a)**, Matt, 16 Nov 2026 |
| 2 | Do addresses name the shell first, or the subject first? | (a) Shell first: `/members/shifts`, `/console/box-office/orders`; (b) subject first: `/rooms` and `/rooms/manage`, as today's Proscenium does | (a). A fork owns every address outside a short reserved list, so a theatre's page can never collide with a platform page after an update, and one rule per prefix sets rendering and guarding | **(a)**, Matt, 16 Nov 2026 |
| 3 | Where does an audience member's account live? | (a) Inside the public shell, as My account; (b) in its own fourth area; (c) in the members' area, with member parts hidden | (a). It keeps the audience experience entirely free of member furniture, which is the pain point you raised | **(a)**, Matt, 16 Nov 2026 |
| 4 | What do members navigate with? | (a) A top bar, with a bottom tab bar on a phone; (b) a sidebar like the console's | (a). Calm, phone-first, and unmistakably not the console for someone who uses both | **(a)**, Matt, 16 Nov 2026 |
| 5 | Should the console work fully on a phone? | (a) Yes, every screen, designed on a laptop first; (b) laptop only, with a notice on small screens | (a). Volunteers approve things from their phones. It costs a card layout per list, which the list component provides once | **(a)**, Matt, 16 Nov 2026 |
| 6 | Does the public site offer dark mode? | (a) Follows the device, with a theatre-level switch to pin it light; (b) always light; (c) always follows the device | (a). Some theatres' posters and photography assume a light page; most do not care | **(a)**, Matt, 16 Nov 2026 |
| 7 | How is checkout laid out on a phone? | (a) Short steps: tickets, details, pay, with the total always visible; (b) one long page | (a). Each step is one decision, errors are local, and the hold timer has one place to live. Guest checkout is the default path either way | **(a)**, Matt, 16 Nov 2026 |
| 8 | How are allocated seats chosen on a phone? | (a) Best available by default, with "Choose my own seats" opening the plan; (b) the plan first | (a). Most buyers want good seats quickly, and a seating plan is the hardest thing to use on a small screen. A list of seats is always available as the accessible route | **(a)**, Matt, 16 Nov 2026 |
| 9 | What should the next round of wireframes be? | (a) A clickable prototype of the three box-office journeys (buy, desk, door) in the browser, in a sample theatre's branding; (b) more static drawings of more screens; (c) nothing more until the build | (a). Taste is hard to judge from boxes. A prototype of the journeys that matter most is cheap and is thrown away afterwards | **(a)**, Matt, 16 Nov 2026 |

## Smaller points decided here unless you object

- **Names.** "Members' area" is the default name and a theatre can rename it ("Company", "Volunteers"). "Console" is the name staff see. "My account" is the audience area. "Tonight" is the hub; "live mode" is only this document's word for the layout.
- **Console group order** is fixed by the platform: Tonight, Programme, Box office, Front of house, Bar, Room bookings, Training, Membership, People, Money, Communications, Forms, Reports. (Programme was added for core's screens after the consistency review of 16 November 2026. Later the same day Matt decided to add a fourth shell, Site administration at `/admin`, for the install-level screens, so the console's last group, System, is gone and question 1's answer now reads four shells plus a live mode. The principle he accepted, a fixed order set by the platform, is unchanged.)
- **No infinite scroll in the console**; pages of 25.
- **Short forms open in a side panel**, long ones on their own page, decided by the component and not by each screen's author.
- **The command palette ships in the first release.** The component library provides it, and the console will pass forty screens quickly.
- **Help opens beside the screen**, from the documentation each module ships.

## Agreed with other workstreams

| With | Point | State |
| --- | --- | --- |
| 1. Foundations | Shell names, reserved prefixes, extra navigation fields, the coverage check, idempotent routes, one refusal body | Agreed on 16 November 2026 |
| 3. Public site | The shape and ownership of public components | Agreed on 16 November 2026: workstream 3 owns them |
| 5. Form builder | That its editor is built from these page types | Agreed on 16 November 2026, with the Editor layout added |
