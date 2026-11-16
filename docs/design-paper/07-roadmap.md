# Phased roadmap

Build the conventions and the core first, then the box office, which is the most important module, then the modules NNT needs, and leave programming and production management until last. No dates are set, because none were given.

| Phase | What is built | Gate |
| --- | --- | --- |
| 0. Decisions | Done on 16 November 2026: see the Decisions tab and the design stage's questions tab. The detailed design is written as twelve specifications in two rounds of six, and the story-level order of work is in the Build backlog and glossary tab. Remaining: move Parts A and B and the specifications into the new repository as living documents | The repository exists under Matt's account with this paper in it |
| 1. Skeleton | Repository layout with owned paths, deploy button, first-run setup, in-app migrations, accounts and the audience experience (the members' area, guest accounts, data download and erasure follow in phase 2), passkey and email-link sign-in, Google sign-in, roles and permissions, the three registries, audit, branding, upstream-merge workflow, CI with local tests on Linux, and, pulled forward from phase 2, sending one transactional email, the brand and the public shell | A stranger forks, deploys and brands a site, aiming for under 30 minutes (a target measured once at this gate, not a test), then merges a release with no conflict |
| 2. Core domain and public site | Seasons, productions, performances, venues and their access features, vocabularies, notifications, files, public site with content components, outgoing webhooks | A theatre publishes a season and a what's-on page |
| 3. Box office | Finance ledger, Payments with an in-person and an online provider, ticket types and pricing, holds, general admission, desk sales, e-tickets, door scanning, reserve now and pay on arrival, one desk payment covering tickets and another module's items, refunds and exchanges, buyer self-service cancellation (off by default), waiting list, complimentary tickets, order history on the account, Front of house's four stories that say who is on shift tonight, and ten bar stories (prices, the till, the desk panel, income). Season passes follow later | A paid booking, a refund and a period close reconcile to the penny, and a full house sells its last seat once |
| 4. Running the night | Front of house (rota, tonight screen, checklists, incidents, night report) and the form builder | A show night runs end to end from a phone |
| 5. NNT parity | Spaces, Bar, Training, Membership, Communications | NNT runs a shadow night, then switches |
| 6. Wider adoption | Allocated seating, gift vouchers and donations at checkout, Inventory, Fundraising, visiting companies, Governance, Reports, and the rest of Finance (budgets, expense claims, invoices, accounting exports, reconciliation) | A second theatre, not NNT, goes live |
| 7. Later, if wanted | Programming and production management, mostly as form templates and workflows on the form builder | A theatre asks for it |

## Why this order

- **Conventions before features.** The registries, the module manifest, the owned-path layout and the test harness are cheap to build first and expensive to retrofit. Proscenium's known issues show what retrofitting costs.
- **Box office straight after the core.** It is the module every theatre needs and the one Matt ranks highest. It also forces the ledger, payments and the audience account to be right early.
- **The form builder in phase 4.** It arrives before the modules that lean on it and removes the need for a programming module. Its first release builds, fills in and reviews forms, and attaches a form to a host module's record with Membership as the first host; custom fields, checkout questions and forms that take payment are later (the Form builder tab says what arrives when).
- **NNT parity as a named phase.** It gives NNT a clear point to switch. Data migration is not a concern: losing data in the move is acceptable, and a standalone import tool is written only if it turns out to be needed.
- **Programming and production management last.** NNT runs proposals on paper and in meetings, and many theatres have no proposals process at all.

Allocated seating sits in phase 6 because NNT sells unreserved seats, but the seat model is designed in phase 3 so adding it later does not rework the box office.

## Before any code

- [x] Create the repository under Matt's account, licensed AGPL-3.0
- [x] Confirm a deploy button can create every Cloudflare resource for a fork
- [ ] Verify Square's and GoCardless's rates on their own pages
- [ ] Ask two or three other theatres what would stop them adopting it

The repository now exists as MattA-Official/proscenium. A real deploy on 16 November confirmed that the deploy button creates the database, bucket, key-value store and queue with nothing typed. Durable Object and dead-letter queue creation are left to check in the build.

**Amendment, 16 November 2026.** Phase 3 grows by two pieces. Front of house's four gate stories (FH-01 to FH-04, the facts that say who is on shift tonight) join it because desk authority rests on them. Ten bar stories (BAR-01 to 05, 10 to 12, 14 and 22: prices, the till, the desk panel and income) join it straight after Box office's desk stories BO-30 to BO-36, by Matt's decision, so one card-reader payment covers tickets and drinks from the first release of the box office. The rest of the bar stays in phase 5. Four form builder stories also come forward with Membership as their first host (FB-501, FB-502, FB-503 and FB-506), and the rest of Finance is placed in phase 6. The foundation kit is built and up for review, and phase 1 building (identity, core domain, interface components) began the same day.
