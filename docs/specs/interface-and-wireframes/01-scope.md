# Interface and wireframes

Nov 16, 2026 · @Matthew Adcock

This is workstream 6 of the detailed-design stage for Proscenium, the open-source theatre platform. It specifies how the platform looks and behaves for the people using it: four shells, one way of building navigation, a small set of page types, and the journeys that matter most, drawn as wireframes. It contains no product code.

## Scope

**In scope**

- The four shells (public, members' area, console, site administration): their layout, who lands in each, and how a person moves between them.
- Navigation: how it is assembled from what modules declare, filtered by what a person may do.
- Page conventions: the page types every module builds from, and the rules for headers, actions, forms, lists, feedback, empty and error states.
- Operational screens: phone-first screens that survive a dropped connection (door, till, tonight).
- Accessibility, language and tone rules that every screen follows.
- Key journeys and wireframes, box office first.
- The settings, abilities and small tables the interface layer itself needs.

**Out of scope**

- The rules behind any screen: prices, holds, capacity, refunds, eligibility. Those belong to the workstream that owns the module.
- The account model, sign-in mechanics and permission model (workstream 2). This document draws their screens and assumes their rules.
- The form builder's own interface (workstream 5). This document gives it the page conventions it builds on.
- The brand derivation algorithm and public content structure (workstream 3). This document says where branding shows.
- Screens for front of house, spaces, bar, training, membership and communications beyond the shared patterns. They are specified in the later round.
- Visual identity: logo, illustration, marketing design.

**Assumed of other workstreams**

| Assumed | Of | If it turns out otherwise |
| --- | --- | --- |
| A module manifest in which a module declares navigation entries, pages, search providers, dashboard cards and settings pages | 1. Foundations | The declarations in tab 4 move to wherever the manifest puts them; the shapes stand |
| A permission registry that answers "may this person do X here" for the server and the page alike | 1. Foundations | Navigation filtering still works, but needs its own endpoint |
| One account with an audience experience for everyone and a members' experience only for those entitled | 2. Identity and accounts | The shell selection rules in tab 3 change |
| A single answer to "is this person a member right now" | 2. Identity and accounts | The "Members' area" link cannot be shown reliably |
| Public pages are Nuxt Content in the fork's site folder, with platform components dropped in | 3. Core domain and public site | The public shell's slots are renamed |
| A derived brand palette that always passes 4.5:1 contrast | 3. Core domain and public site | Brand colour is confined to accents |

## How to read this document

The tabs are the nine parts every workstream delivers, in the same order.

| Tab | What it holds |
| --- | --- |
| 1. Scope | This page |
| 2. Data model | The three small tables and the device stores the interface layer keeps |
| 3. States and rules | Request routing, page data states, queued writes and form saving, each drawn and then tabulated |
| 4. Interface to other modules | What a module declares to appear in the interface, and the shared components it builds from |
| 5. Screens | The inventory of screens, with four sub-tabs: Shells and navigation, Page conventions, Key journeys, Wireframes |
| 6. Settings and abilities | The interface layer's own 15 settings and 3 abilities |
| 7. Stories | 36 stories, UI-01 to UI-36 |
| 8. Test plan | 26 named test cases |
| 9. Questions for Matt | Nine decisions, each with options and a recommendation, and what has been agreed with other workstreams |

Someone short of time should read Shells and navigation, look at the Wireframes, and answer tab 9.

## Status

Agreed with the other workstreams and brought into line with the consistency review and Integration's rulings, 16 November 2026. A [clickable prototype of the buy, desk and door journeys](https://claude.ai/artifact/CRHCxGx74xquxnRa6qVi4C) accompanies it; it uses sample data and is to be thrown away. Every part is written and every drawing is in place.

- **Agreed with workstream 1 (Foundations):** the navigation, page, search, card and settings declarations, the module id `core` for the interface layer, and the `/console` prefix.
- **Agreed with workstream 5 (Form builder):** the Editor layout, the review queue's two homes, and where My forms sits.
- **Agreed with workstream 3 (Core domain and public site):** it owns `core.public-component` and the brand function; `/files` is reserved; by Matt's decision a production lives at `/whats-on/<slug>` while current and `/shows/<slug>` once past, and both prefixes are reserved for core's pages (they answer not found while the public site module is off); a performance's access features show as icon and label chips from core's `core.access-feature` vocabulary, never an icon alone.
- **Agreed with workstream 2 (Identity and accounts):** it has named the fact `core.member` and the `describeViewer` call, and tab 3 uses them. The shift window belongs to the later front of house round; tab 3 states the assumption.
- **Waiting on Matt:** nothing. He accepted all nine recommendations in tab 9 on 16 November 2026, which is what the specification already assumed.
