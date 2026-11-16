# Front of house: specification

Nov 16, 2026 · @Matthew Adcock

Front of house is the module that puts people on a night and records how the night went: the rota, the shift, the front of house section of Tonight, checklists, incidents and the night report. This is its specification, written on 16 November 2026 in the second round, in the same nine parts as the first six.

## What this document settles

- **The on-shift fact and the shift window.** Three other specifications wait on these: Interface's on-shift bar (UI-05), Box office's door check (BO-44) and Identity's mapping of abilities to facts (ID-26). They are defined in part 3 and declared in parts 4 and 6.
- **Three facts, not one.** `front-of-house.on-shift` gives authority for one performance while the window is open. `front-of-house.leading-shift` marks the person running the night. `front-of-house.rostered` only opens the members' area for someone with a shift ahead of them.
- **The module needs nothing but the core.** It reads ticket and till figures through two points that Box office, Payments and Bar contribute to, so it runs with any of them switched off.
- **Seventeen tables**, sixteen id prefixes, 47 stories (4 gate, 31 others in the first release, 12 later).

## How to read it

| Part | Holds |
| --- | --- |
| 1. Scope and glossary | What the module owns, what it leaves alone, its words |
| 2. Data model | Every table in the Foundations layout |
| 3. Rules and flows | States, the shift window, the facts, checklists, incidents, the night report |
| 4. Interface to other modules | Facts, points, services, events, tasks, and what is asked of others |
| 5. Screens | Members' area, console and live mode, by page type |
| 6. Settings and abilities | One row each, in the registry columns |
| 7. Stories | FH-01 to FH-47 |
| 8. Tests | Named cases by tier |
| 9. Questions for Matt | Ten decisions, each with the option chosen |

Matt accepted all ten recommendations in part 9 on 16 November 2026, so the document is written on decided options. It has since been aligned to rulings from Foundations, Interface, Core domain, Box office and Identity.

## Written against

[Foundations formats](https://claude.ai/artifact/RKRTkLkrG98jXHSBptUc1x) with every dated ruling to 16 November; [Interface conventions](https://claude.ai/artifact/KwZ3oXcFJSMNj98kNc9ywW) (shells, page types, live mode); [Identity](https://claude.ai/artifact/BcVS8iNe7oDZCPmW4gyus5) (facts and standing); [Box office](https://claude.ai/artifact/MUbXSQbs4vQKMyvxZL44Po) (BO-44 and the attendance figures); [Form builder](https://claude.ai/artifact/6E5k2VS2PnhdciVNMeap5s) (form slots); and the glossary rulings in the [design paper](https://claude.ai/artifact/8Yn8fPcsngaKVrTdijBaiD). Screens are described in words, with two drawn wireframes in part 5.
