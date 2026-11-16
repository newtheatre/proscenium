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
