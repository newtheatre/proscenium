# Decisions

All eleven choices were decided by Matt on 16 November 2026, and the rest of the paper now follows the Decision column. Where a decision differs from the recommendation, the decision stands.

| Question | Options | Recommendation | Decision |
| --- | --- | --- | --- |
| How do theatres receive updates? | Fork the whole application and merge upstream; or fork a thin site template that extends a versioned platform layer | The thin template. A theatre still forks and still owns its pages, but an update is a version bump with no merge | Fork the whole application and merge upstream |
| One theatre per deployment, or many? | Single-tenant; or multi-tenant with an organisation column on every table | Single-tenant. Simpler, private by construction, and friendly to the free plan. Revisit only if a hosted service is wanted | Single-tenant |
| Which licence? | AGPL-3.0 (as Mailflare), MIT, or Apache-2.0 | AGPL-3.0, so hosted forks must share changes. MIT if adoption by venues with cautious lawyers matters more | AGPL-3.0 |
| Where does the Workers free plan stop? | Design for free only; or accept the paid plan for some features | Core and most modules on free. Queues, Durable Objects and email sending have plan limits to check against current Cloudflare pricing before Phase 1 | Hosts should be assumed to have Workers paid. |
| Which online payment provider first? | Stripe, SumUp online, Square, GoCardless | Stripe, for coverage, behind the provider interface. To be confirmed | This isn't massively important which is first |
| Which sign-in methods ship first? | Passkey only; passkey plus password; plus Google or Microsoft | Passkey plus email link, with Google as the first identity provider because NNT needs it | As recommended |
| How far do custom fields go? | Fixed schema only; typed custom fields; a full form builder | Typed custom fields on a short list of records. A form builder only if Programming needs it | I would support a full form builder with a powerful engine behind it. Get inspiration from <https://github.com/MattA-Official/form-builder> do not copy it - it's not very usable. |
| Is a visual content editor in scope? | Git only; Nuxt Studio; a built-in editor | Git only at first, with Nuxt Studio documented as an option | As recommended |
| What is the project called? | Keep Proscenium; a new name | A new name, so the NNT system and the general platform are not confused | Keep proscenium |
| Where does the new code live? | A new organisation; under an existing account | Matt to decide | Under my own account, later moved if needed |
| Does NNT migrate from Proscenium, or from the four older apps? | Either | Depends on where Proscenium's cutover stands when Phase 5 arrives | From proscenium/unified (cutover is complete for all intents and purposes) \
\
This should NOT be a major concern as we do not care about data loss moving to the new platform. If required we will build a standalone tool designed for us. |

## Research

- What comparable open-source and commercial theatre systems offer.
- Current Cloudflare plan limits and prices.
- Payment-provider terms for small charities and student groups.

All three were researched on 16 November 2026. The findings are in the Research tab.

**Backups (16 November 2026).** The consistency review found the paper promised nightly backups that no specification delivered. Matt chose to drop the promise: the platform takes no backups, records no restore points and schedules no backup story. A theatre relies on what Cloudflare keeps for its database.

**Access needs and emergency contacts (16 November 2026).** Matt ruled that emergency contacts are for members only and that access needs are an audience matter for every account. Access needs are not a module: they are a named part of the core. Matt then shaped them as an access scheme a person applies to (from the public page /access or My account), which staff accept or reject, rather than a list anybody ticks; nobody ticks needs at checkout. Being verified is a separate mark made in person, for example on seeing an Access Card, and no card number is stored. The categories follow the nine of the Nimbus Access Card in the platform's own words. Production teams do not read access needs in the first release. Checking a card with Nimbus online is a later, optional story. The detail is in the [Identity specification](https://claude.ai/artifact/BcVS8iNe7oDZCPmW4gyus5), stories ID-17 and ID-38 to ID-45.

**Append-only with named exceptions (24 November 2026).** Decision 0010 (Foundations rule G6) keeps the ledger, stock, incidents, age checks, prices, records and audit wholly append-only: a correction supersedes, never edits. The kit's `appendOnly: { except: [...] }` adds one narrower form for a versioned row whose terms are fixed but whose state moves: the triggers still refuse every delete and every change except to the named columns. Its first and only use is Companies' `companies_agreements` (spec 3, rule A1), where a version's `state` moves along part 3's moves and `sent_at` is set when it is sent; changing the terms writes a new version. The kit refuses the option on decision 0010's tables (any `finance_` table, `core_audit`, and tables ending `_stock_movements`, `_incidents`, `_incident_updates`, `_age_checks`, `_prices` or `_records`), so a later table of those kinds cannot use it.
