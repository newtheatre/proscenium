# Sources

## How to read this tab

Every claim this specification makes about another system is listed here with where it was read. Repository files were read on 16 November 2026 from the default branches of the checked-out repositories. Nothing in this specification is copied from Proscenium: each entry is a lesson, and the design is new.

## This project's own documents

| Document | Used for |
| --- | --- |
| [Design paper](https://claude.ai/artifact/8Yn8fPcsngaKVrTdijBaiD), all tabs | Conventions (unit of work, data classes, settings, abilities, shells, branding), Matt's decisions, the roadmap's phase 2 gate |
| [Platform foundations](https://claude.ai/artifact/RKRTkLkrG98jXHSBptUc1x): Formats, Module manifest, Settings registry, Abilities registry, Data-class registry | Naming, the four mechanisms, table and setting layouts, `col.account`, the rulings recorded in parts 2 and 4 |
| [Interface](https://claude.ai/artifact/KwZ3oXcFJSMNj98kNc9ywW), by its author's note, not read in full | Reserved address prefixes, ownership of public components, where the expressive brand treatment applies |
| Form builder (workstream 5), by the integrating thread's note | That vocabularies are core's |

## Proscenium (github.com/newtheatre/proscenium)

| Claim | Where |
| --- | --- |
| A venue is its own record, never a flagged room | `server/db/schema/programme.ts`, citing decision 0043 |
| Season check is `ends_on > starts_on`, so a season cannot be one day long | `server/db/schema/programme.ts`; `docs/known-issues.md` |
| A show cannot be published until warnings are listed or confirmed as none | `server/db/schema/programme.ts` (`warningsConfirmedNone`) |
| Performance states are draft, on sale, cancelled; an external booking link is a performance field; a capacity override of null inherits | `server/db/schema/programme.ts` |
| Transactional messages have no topic and so cannot be muted | `server/db/schema/notifications.ts`, citing decision 0013 |
| A unique claim column makes a send safe to repeat; the retry payload is cleared at a final status | `server/db/schema/notifications.ts`, citing decision 0056 |
| The inbox never marks a message read and shows no unread count | `docs/known-issues.md` |
| Merging accounts leaves preferences, the log and the inbox on the losing account | `docs/known-issues.md` |
| A report bypasses the retry sweep by using a different send function | `docs/known-issues.md` |
| Editorial pages are markdown with no editing surface; the social image is static because the image generator's WASM cannot be bundled for the Worker | `docs/known-issues.md`; `nuxt.config.ts` (`ogImage: { enabled: false }`) |
| Content collections, the `placeholder` front-matter field and the D1 content database on binding `DB` | `content.config.ts`; `nuxt.config.ts`; decision 0051 |
| Policy numbers are quoted on pages as `{{KEY}}` and checked in CI | `shared/utils/policy-tokens.ts`; decision 0012 |
| The show night runs 04:00 to 04:00, London time | Decision 0014 |
| Replacing an image repoints the row before forgetting the old file | `server/utils/images.ts` |
| A wide change shows its impact before it is confirmed | `server/utils/blast-radius.ts` |
| Old-site addresses are redirected permanently | `nuxt.config.ts` route rules |

## Flytower (github.com/teamflytower/flytower)

| Claim | Where |
| --- | --- |
| One accent colour makes a shade ramp; the nearest shade reaching 4.5 to 1 is chosen for each mode; status colours are fixed | `docs/branding.md`; `apps/panel/shared/branding.ts` |
| An SVG logo is rebuilt from safe elements and a DOCTYPE is refused; a PNG is re-encoded without metadata; 1 MB raw limit | `apps/panel/server/branding/svg.ts`, `png.ts`; `docs/branding.md` |
| The brand is served as public data and as a theme stylesheet; saving asks for a passkey; a "Powered by" line can be turned off | `docs/branding.md`; `apps/panel/server/branding/index.ts` |
| Alerts go to Discord, ntfy and signed webhooks; the same problem alerts at most once in a quiet period | `docs/notifications.md` |

## Mailflare (github.com/MattA-Official/mailflare, `nuxt` branch)

| Claim | Where |
| --- | --- |
| Branding there is an app name and icon only, kept in settings and one stored object | `server/lib/branding/service.ts` |
| Email, queue and scheduled handlers live in a custom Worker entry because the framework's hooks run too late to acknowledge or retry a message | `CLAUDE.md`, "How the server works" |

## Vendor documentation

| Claim | Where | Read |
| --- | --- | --- |
| A Nuxt Content collection can read files from a folder outside the content directory by setting `source.cwd` | [content.nuxt.com/docs/collections/sources](https://content.nuxt.com/docs/collections/sources) | 16 November 2026 |
| Nuxt Content on Cloudflare Workers needs a D1 database; the default binding is `DB` | [content.nuxt.com/docs/deploy/cloudflare-workers](https://content.nuxt.com/docs/deploy/cloudflare-workers) | 16 November 2026 |
| Cloudflare Images can transform images held in R2; the first 5,000 unique transformations a month are included, then 0.50 US dollars per 1,000; format and quality do not count as unique | [developers.cloudflare.com/images/pricing](https://developers.cloudflare.com/images/pricing/) (page dated 19 October 2026) | 16 November 2026 |

On the last row: five named sizes mean each image costs at most five unique transformations a month. A theatre with 800 public images in active use stays inside the included 5,000. This is why arbitrary sizes cannot be requested.

## Not verified

| Claim the design leans on | Standing | What depends on it |
| --- | --- | --- |
| Cloudflare Email Sending reports bounces and complaints back to the Worker | Not checked against documentation | The Sent to Bounced move and automatic suppression. Without it, suppression is manual only, and the health screen says so. |
| A theatre-owned `site/content.config.ts` survives an upstream merge | Under test by the foundations owned-paths proof | Theatre-defined content collections. Pages and news do not depend on it. |
| A rendered social card for each production can be generated on a Worker | Proscenium could not; not re-tested | Only the later "rendered card" improvement. The first release uses the poster or the brand's social image. |
| The United Kingdom's bank-holiday feed format and address | Not read | Story C-19, a later release |
| Whether a theatre may lawfully publish cast names by default | Not legal advice | Question 5 |
| No other theatre has been consulted | As the design paper already records | Every default in part 6 |
