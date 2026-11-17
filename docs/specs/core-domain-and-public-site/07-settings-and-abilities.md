# 6. Settings and abilities

## How to read this part

Both tables use the layouts the foundations draft fixes. Every default is a proposal for Matt to confirm, not a decision. Where no sensible default exists the setting ships unset, and the feature that needs it says so by name.

Settings are site-wide. Where a value varies by record, such as a performance's doors time, it is a column on the record whose starting value comes from a setting.

## Settings: organisation

Five facts about the theatre are foundations settings, because the kit is built on them, and are not repeated here: its name (`core.site.name`), time zone (`core.locale.time-zone`), language (`core.locale.language`), currency (`core.locale.currency`) and the hour the operating day begins (`core.locale.day-start`, default 04:00). Wherever this specification speaks of the theatre's name, time zone, language, currency or day rollover, it means those keys. The Theatre page in Site administration shows them beside the organisation settings below, so an administrator sees one page.

| Key | Kind | Default | Limits | Changed by | Audience | Quotable | Purpose |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `core.organisation.short-name` | text | unset | up to 30 characters | `core.organisation.edit` | public | Yes | Used where space is tight: text messages, the passkey prompt |
| `core.organisation.week-start` | choice | monday | monday, sunday, saturday | `core.organisation.edit` | public | No | Calendars |
| `core.organisation.country` | choice | `GB` | ISO country codes | `core.organisation.edit` | staff | No | Which public holidays to import |
| `core.organisation.contact-email` | text | unset | An email address | `core.organisation.edit` | public | Yes | Public contact. A role address, not a person's. |
| `core.organisation.contact-phone` | text | unset | up to 30 characters | `core.organisation.edit` | public | Yes | Public contact |
| `core.organisation.address` | text | unset | up to 300 characters | `core.organisation.edit` | public | Yes | Postal address on the contact component and on receipts |
| `core.organisation.social-links` | custom | empty | A list of a network and an address | `core.organisation.edit` | public | No | The social links component. Custom because each item is a pair. |
| `core.organisation.legal-name` | text | unset | up to 120 characters | `core.organisation.edit` | public | Yes | Footer and receipts, where it differs from the name |
| `core.organisation.charity-number` | text | unset | up to 30 characters | `core.organisation.edit` | public | Yes | Footer, where the theatre is a charity |

The 04:00 day start is Proscenium's show-night rule (its decision 0014), here as a default a theatre can change.

One more organisation setting, added on 16 November 2026 by the integrating thread's ruling, which is reported to Matt as an assumption:

| Key | Kind | Default | Limits | Changed by | Audience | Quotable | Purpose |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `core.organisation.year-end` | text | unset | A day and a month, such as 31 July | `core.organisation.edit` | staff | No | The day the theatre's own year ends, stored as month and day in the form MM-DD, such as 07-31. 29 February is refused, so the day exists in every year. The single source for the identity module's year-end expiry of roles. While it is unset, "year end" cannot be chosen as an expiry. The financial year is the Finance module's own setting. |

The time zone stays unset until setup, and its audience is public, because public pages and the calendar feed show local times.

## Settings: brand

| Key | Kind | Default | Limits | Changed by | Audience | Quotable | Purpose |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `core.brand.accent` | colour | A neutral blue | A hex colour | `core.branding.edit` | public | No | The one colour everything derives from |
| `core.brand.neutral` | choice | `slate` | slate, stone, zinc, neutral | `core.branding.edit` | public | No | The tone of greys: cool, warm or plain |
| `core.brand.display-font` | choice | `system` | The bundled fonts, or `system` | `core.branding.edit` | public | No | Headings in the public shell |
| `core.brand.radius` | choice | `medium` | none, small, medium, large | `core.branding.edit` | public | No | How rounded corners are |
| `core.brand.credit-line` | boolean | true |  | `core.branding.edit` | public | No | Shows "Powered by Proscenium" in the public footer |
| `core.brand.revision` | integer | 0 | Managed | Nobody: raised on save | public | No | Cache-busting for the stylesheet and logos |

The depth of branding is as Matt decided on question 3. Light and dark mode are not brand settings: the interface specification owns them, as `core.appearance.default` and `core.appearance.public-dark`, by Matt's decision there. The credit line is declared here and nowhere else.

## Settings: programme

| Key | Kind | Default | Limits | Changed by | Audience | Quotable | Purpose |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `core.programme.doors-before` | duration | 30m | 0m to 3h | `core.programme.configure` | public | Yes | Starting value for when doors open before a performance |
| `core.programme.default-running-time` | duration | 2h | 10m to 8h | `core.programme.configure` | staff | No | Starting value for a new performance's end time |
| `core.programme.listing-grace` | duration | 0m | 0m to 6h | `core.programme.configure` | staff | No | How long after it starts a performance stays on what's on |
| `core.programme.archive-seasons` | boolean | true |  | `core.programme.configure` | staff | No | Archive a season automatically once it ends |
| `core.programme.advisories-collapsed` | boolean | true |  | `core.programme.configure` | public | No | Hide advisories behind a "show" control, so they do not spoil the plot for those who do not want them |
| `core.programme.credits-public` | boolean | true |  | `core.programme.configure` | public | No | Starting value for whether a new production's credits are public (question 5) |
| `core.programme.team-standing-after` | duration | 30d | 0d to 365d | `core.programme.configure` | staff | No | How long after a production's last performance its team keeps the fact `core.production-team` |
| `core.programme.cancel-reasons` | reference | `core.cancel-reason` | A vocabulary | Fixed | staff | No | The reasons offered when cancelling. Edited as a vocabulary, listed here for completeness. |

## Settings: files

| Key | Kind | Default | Limits | Changed by | Audience | Quotable | Purpose |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `core.files.image-limit` | integer (megabytes) | 10 | 1 to 50 | `core.file.configure` | signed-in | No | Largest image upload |
| `core.files.document-limit` | integer (megabytes) | 25 | 1 to 100 | `core.file.configure` | signed-in | No | Largest document upload |
| `core.files.brand-limit` | integer (megabytes) | 1 | 1 to 5 | `core.file.configure` | staff | No | Largest logo upload before cleaning |
| `core.files.deleted-retention` | duration | 30d | 0d to 365d | `core.file.configure` | staff | No | How long a deleted file can be restored |
| `core.files.upload-timeout` | duration | 1h | 5m to 24h | `core.file.configure` | staff | No | When an upload that never arrived is rejected |

The brand limit is Flytower's figure for a raw logo. The others are judgement.

## Settings: notifications

| Key | Kind | Default | Limits | Changed by | Audience | Quotable | Purpose |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `core.notifications.sending-domain` | text | unset | A domain name | `core.sender.manage` | staff | No | The domain mail is sent from. No mail is sent until it is set and verified. |
| `core.delivery.max-attempts` | integer | 5 | 1 to 10 | `core.notification.configure` | staff | No | Tries before a delivery fails for good |
| `core.delivery.first-retry` | duration | 2m | 1m to 1h | `core.notification.configure` | staff | No | Wait before the first retry. Each later wait is four times the last. |
| `core.delivery.stuck-after` | duration | 10m | 5m to 2h | `core.notification.configure` | staff | No | When a queued or sending delivery is treated as stuck |
| `core.notifications.digest-time` | time | 08:00 | Any | `core.notification.configure` | signed-in | No | When daily digests go out |
| `core.notifications.digest-day` | choice | monday | A day of the week | `core.notification.configure` | signed-in | No | When weekly digests go out |
| `core.delivery.log-retention` | duration | 400d | 30d to 2555d | `core.notification.configure` | staff | No | How long the delivery log is kept |
| `core.delivery.inbox-retention` | duration | 180d | 30d to 730d | `core.notification.configure` | signed-in | No | How long an inbox message stays |
| `core.notifications.email-footer` | text | unset | up to 500 characters | `core.template.edit` | staff | No | Text under every email, such as a registered address |

One more notification setting belongs to story C-52: `core.notifications.sending-label` (text, changed by `core.sender.manage`), the label of the sending subdomain that automatic setup creates under the site's hostname. It holds one DNS label, and its default is `mail`, Matt's choice of 16 November 2026. The optional secret `CORE_CLOUDFLARE_TOKEN` that automatic setup needs is listed in the foundations specification's secrets table, not here. Part 4 gives the whole design.

400 days keeps one full year of sends plus a month, so "did last year's renewal reminder go out?" can be answered.

## Settings: webhooks

| Key | Kind | Default | Limits | Changed by | Audience | Quotable | Purpose |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `core.webhooks.max-attempts` | integer | 8 | 1 to 15 | `core.webhook.manage` | staff | No | Tries before a webhook delivery fails for good |
| `core.webhooks.pause-after` | integer | 20 | 5 to 100 | `core.webhook.manage` | staff | No | Failures in a row before the system pauses a webhook |
| `core.webhooks.log-retention` | duration | 30d | 1d to 365d | `core.webhook.manage` | staff | No | How long the webhook delivery log is kept |
| `core.webhooks.timeout` | duration | 10s | 1s to 30s | `core.webhook.manage` | staff | No | How long core waits for a receiver to answer |

## Settings: public site

| Key | Kind | Default | Limits | Changed by | Audience | Quotable | Purpose |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `public-site.search.hidden` | boolean | true until setup completes, then false |  | `public-site.site.configure` | public | No | Ask search engines to stay away |
| `public-site.meta.title-pattern` | text | `{page} - {name}` | Must contain `{page}` | `public-site.site.configure` | public | No | The browser title of every public page |
| `public-site.archive.public` | boolean | true |  | `public-site.site.configure` | public | No | Whether past shows are public. Off makes `/shows`, every past production, archived seasons and the archive search answer "not found" (question 7). |
| `public-site.archive.from-year` | integer | unset | 1800 to this year | `public-site.site.configure` | public | Yes | The earliest year the archive shows. Unset shows everything. |
| `public-site.listing.cancelled-visible` | boolean | true |  | `public-site.site.configure` | public | No | Keep cancelled performances visible until their date passes |
| `public-site.feeds.calendar` | boolean | true |  | `public-site.site.configure` | public | No | Offer the calendar feed |
| `public-site.data.open` | boolean | true |  | `public-site.site.configure` | public | No | Offer the published programme as open data |

**One rule across settings:** `core.delivery.stuck-after` must be longer than `core.delivery.first-retry`.

## Where each setting is shown

By ruling R-37 (Matt's settings redesign of 16 November 2026, brief at `/mnt/project-files/settings-design/build-brief.md`), a setting carries no scope of its own. The manifest declares `settingGroups`, keyed by the first segment of a setting's short key, and `settingPages`. Every setting has exactly one home: one generated settings page, or one named bespoke screen, never both and never none. There is no core settings page in either shell.

| Group | Place | Home | Declared as |
| --- | --- | --- | --- |
| `site` (foundations' `core.site.name` and `core.site.origin`) | Site administration, Theatre | Theatre page, `/admin/theatre` | `{ place: 'admin', page: 'core.theatre' }` |
| `organisation` | Site administration, Theatre | Theatre page, `/admin/theatre` | `{ place: 'admin', page: 'core.theatre' }` |
| `locale` (foundations' keys) | Site administration, Theatre | Theatre page, `/admin/theatre` | `{ place: 'admin', page: 'core.theatre' }` |
| `brand`, `appearance` | Site administration, Theatre | Branding, the bespoke screen | `{ place: 'admin', screen: '/admin/branding' }` |
| `notifications` | Site administration, Email | Email, the bespoke screen | `{ place: 'admin', screen: '/admin/email' }` |
| `delivery` | Site administration, Upkeep | Advanced page, `/admin/advanced` | `{ place: 'admin', advanced: true }` |
| `files` | Site administration, Upkeep | Advanced page, `/admin/advanced` | `{ place: 'admin', advanced: true }` |
| `webhooks` | Site administration, Upkeep | Advanced page, `/admin/advanced` | `{ place: 'admin', advanced: true }` (ruled by Integration, 16 November 2026) |
| `programme` | Console, Programme | Programme settings page | `{ place: 'console', page: 'core.programme' }` |
| every `public-site.*` group | Site administration, Modules | the public site module's own settings page | `place: 'admin'`, page left to the module default (ruled by Integration, 16 November 2026) |

**As built, and where it ends.** The table above is the end state. The kit's format as built (kit PR 115, and the foundations specification's Settings registry) differs from the brief in three ways. No group names an ability: every setting names its own, as the tables in this part already do. Page ids take the form `[module].[page]`, so core's pages are `core.theatre`, `core.branding` and `core.programme`, with `core.advanced`, `[module].settings` and `[module].admin` reserved. And a setting may name a bespoke screen only once that screen shows and saves it. Until then it sits on a generated page, so some settings have an interim home:

| Settings | Home now | Home at the end | What moves them |
| --- | --- | --- | --- |
| `core.brand.*` and `core.appearance.*` | The generated page `core.branding`, at `/admin/branding` | The bespoke Branding screen, at the same address | The Branding screen of part 5 being built so that it shows and saves every one of them |
| `core.notifications.sending-domain` and `verified-domain` | The bespoke Email screen, `/admin/email`, which shows and saves them today | The same | Nothing |
| `core.notifications.sending-label`, `email-footer`, `digest-time` and `digest-day` | The generated Theatre page, `core.theatre` | The bespoke Email screen, `/admin/email` | Story C-59, the Email screen extension in part 5 |

A move is one manifest change, made in the same pull request as the screen that takes the setting, so a setting is never on two homes and never on none. The address `/admin/branding` does not change when the bespoke screen replaces the generated page.

The other core groups in the brief's table (`sign-in`, `sessions`, `recovery`, `access`, `privacy`, `grants`, `members-area`, `access-scheme`, `emergency-contacts`, `merge`, and the kit's `units`, `jobs`, `external`, `idempotency`, `rate-limits`, `retention`) belong to the identity and foundations specifications, which declare them.

**The notifications group was split by rename** (ruled by Foundations, 16 November 2026). `core.notifications.*` keeps what the Email screen manages: `sending-domain`, `verified-domain`, `sending-label` and `email-footer`, with `digest-time` and `digest-day` beside them (ruled by Integration, 16 November 2026: they are a choice about the theatre's email, not an engineering limit, so the group keeps six settings). The engineering half became the group `core.delivery.*`, each key declared with `replaces` naming its old key so a stored override carries across:

| New key | `replaces` |
| --- | --- |
| `core.delivery.max-attempts` | `core.notifications.max-attempts` |
| `core.delivery.first-retry` | `core.notifications.first-retry` |
| `core.delivery.stuck-after` | `core.notifications.stuck-after` |
| `core.delivery.log-retention` | `core.notifications.log-retention` |
| `core.delivery.inbox-retention` | `core.notifications.inbox-retention` |

The setting group `delivery` and the ability `core.delivery.read` share a word and nothing else: one is a group of settings, the other lets a person read the delivery log.

**The site's address.** `core.site.origin`, the site's one public address, is a foundations setting in group `site` on the Theatre page, declared `onChange: 'confirm'`. Core reads it wherever it builds an absolute link and does not redeclare it.

**The Organisation screen is the Theatre page.** Core no longer draws a screen of its own at `/admin/organisation`. The organisation settings sit on the generated Theatre page with the site and locale groups, and part 5 names it so.

**Durations.** Every duration setting above is entered through the kit's `DurationInput` (a number and a unit, from seconds to years, with a month as 30 days and a year as 365). Storage is unchanged, whole seconds, and the written defaults in this part keep their form.

A stored duration is shown in the largest unit that divides it exactly, so a duration setting's label and help never name a unit (a foundations ruling of 16 November 2026). The labels are written as "How long a sent message is kept", never "Days to keep". The same holds for the catalogue text of every duration setting in this part.

**Settings that ask before they save.** As built (kit PR 117), freshness on a settings save follows the setting, not the ability: a fresh sign-in is asked only where the setting itself declares `onChange: 'confirm'` or `'reason'`, though a strong session is still required where the ability needs one. So each setting whose silent change would matter declares `onChange: 'confirm'`. The save shows what will change and asks again. Core and the public site module declare it on these, and on no others:

| Setting | Why a silent change matters |
| --- | --- |
| `core.notifications.sending-domain`, `verified-domain` and `sending-label` | They decide the address every email leaves from. A wrong value stops mail or sends it from a domain nobody verified. |
| `core.organisation.year-end` | Identity ends grants on it, so moving it ends or extends people's access. |
| `core.programme.credits-public` | It puts people's names on the public site, or takes them off. |
| `core.files.deleted-retention`, `core.delivery.log-retention`, `core.delivery.inbox-retention` and `core.webhooks.log-retention` | Shortening one deletes records at the next sweep, and they cannot be brought back. Integration has made this the rule for every retention setting in core and in every module, and the kit checks it. These four are all of core's. |
| `public-site.search.hidden` | It turns search engines away from the whole site, or lets them in. |
| `public-site.archive.public`, `public-site.feeds.calendar` and `public-site.data.open` | Each opens or closes a public surface: the archive, the calendar feeds, the open data. |

Webhook endpoints and their secrets are records, not settings, and keep their own checks (part 4). `core.site.origin` is foundations' and already confirms.

**Who sees a setting's history.** The history of one setting is visible to whoever may change that setting. The whole history, at `/admin/settings-history`, needs `core.audit.view`.

## Abilities

23 abilities. "Preset roles" names the identity specification's preset keys that hold each ability when a theatre first sets up. The owner holds everything and is not repeated.

| Ability | Acts on | Risk | Owner | Implies | Purpose | Preset roles |
| --- | --- | --- | --- | --- | --- | --- |
| `core.production.view` | `core.production` | normal | ignored |  | See productions that are not yet public, and the console programme screens | `administrator`, `committee-member`, `communications-officer`, `technical-manager`, `front-of-house-manager`, `box-office-manager`; `production-lead` and `visiting-company` on their own production |
| `core.production.create` | site | normal |  | `production.view` | Start a new production | `administrator` |
| `core.production.edit` | `core.production` | normal | ignored | `production.view` | Edit details, credits, media, advisories. Delete a draft. | `administrator`; `production-lead` and `visiting-company` on their own production |
| `core.production.publish` | `core.production` | normal | ignored | `production.edit` | Publish and withdraw | `administrator`, `communications-officer` |
| `core.production.cancel` | `core.production` | privileged | ignored | `production.view` | Cancel a whole production | `administrator` |
| `core.performance.schedule` | `core.production` | normal | ignored | `production.view` | Add, schedule, reschedule and move performances; change capacity | `administrator`; `production-lead` on their own production |
| `core.performance.cancel` | `core.production` | privileged | ignored | `production.view` | Cancel or reinstate a performance | `administrator`, `front-of-house-manager` |
| `core.season.manage` | site | normal |  |  | Create, edit, publish and archive seasons | `administrator` |
| `core.venue.manage` | `core.venue` | normal | ignored |  | A venue and its spaces. Creating a venue needs it site-wide. | `administrator`, `technical-manager` |
| `core.closure.manage` | site | normal |  |  | Closures | `administrator`, `technical-manager` |
| `core.vocabulary.manage` | `core.vocabulary` | normal | ignored |  | Add, rename, reorder, retire and merge terms | `administrator`; a module's manager, by a grant on that vocabulary |
| `core.file.manage` | site | normal |  |  | The file library: see every file, restore, delete | `administrator` |
| `core.file.configure` | site | normal |  |  | File settings | `administrator` |
| `core.branding.edit` | site | privileged |  |  | Change the brand | `administrator`, `communications-officer` |
| `core.organisation.edit` | site | privileged |  |  | Organisation settings | `administrator` |
| `core.programme.configure` | site | normal |  |  | Programme settings | `administrator` |
| `core.template.edit` | site | normal |  |  | Message wording | `administrator`, `communications-officer` |
| `core.sender.manage` | site | privileged |  |  | Sender identities and the sending domain | `administrator` |
| `core.delivery.read` | site | privileged |  |  | The delivery log and health screens. Lift a suppression. Retry a delivery. | `administrator` |
| `core.notification.configure` | site | normal |  |  | Notification settings | `administrator` |
| `core.webhook.manage` | site | privileged |  |  | Create, edit, pause and resume webhooks, rotate a secret, send a test, read the webhook delivery log, change webhook settings | `administrator` |
| `public-site.readiness.view` | site | normal |  |  | The site-readiness screen | `administrator`, `communications-officer` |
| `public-site.site.configure` | site | normal |  |  | Public site settings | `administrator`, `communications-officer` |

Notes on the choices:

- **Scheduling and cancelling act on the production, not the performance.** A new performance has no record to check against yet, and a grant on a production should cover all its dates.
- **Cancelling is privileged and scheduling is not.** Cancelling is the one programme action that reaches ticket holders and money.
- **Branding is privileged** because the brand appears on the sign-in screen. This is where Flytower's passkey check on saving the brand comes from.
- **The delivery log is privileged** because it shows who was sent what. **Webhooks are privileged** because they send the theatre's events to an outside address.
- **Production and venue can scope a grant.** A grant of `core.production.edit` on one production, or `core.venue.manage` on one venue (a hirer's own manager, say), is possible. Seasons, closures and spaces cannot scope a grant; a space is covered by its venue.
- **No role is defined in any module.** The preset column uses the identity specification's keys and adds none. With these presets only an administrator or the owner builds the season and schedules across productions. If a theatre wants a programming role it makes its own, which the identity specification allows.
- **Work on the night is not a role.** Cancelling tonight's performance from the door is covered by `front-of-house-manager`; a duty manager's authority comes from the shift, which is the Front of house module's to say.
- **Uploading a file needs no ability of its own.** It needs the ability to edit the record the file is going onto.
- **Hiding your own credit needs no ability.** The person a credit is linked to may change that credit's visibility. The route checks that the credit's account is the caller, and nothing else about the credit can be changed that way.

## Facts

Core declares one, at workstream 2's request.

| Fact | Record type | Standing | Holds when |
| --- | --- | --- | --- |
| `core.production-team` | `core.production` | Yes | The account is linked to a credit on the production, from the moment the credit is linked until `core.programme.team-standing-after` has passed since the production's last performance ended (duration, default 30d, 0d to 365d, changed by `core.programme.configure`). A production with no performances yet counts as current. |

Standing means that holding it puts the person on the members' side of their account, so a cast member sees the members' area without anyone granting a role.

**The fact grants nothing by default.** A credit is a public record, and a name on a cast list should not quietly carry editing rights. A theatre maps abilities to the fact on workstream 2's permission screen if it wants its teams to edit their own production. Workstream 2's preset roles `production-lead` and `visiting-company`, scoped to one production, are the suggested holders of `core.production.edit` and `core.performance.schedule` on that production.

The later production-management module may declare finer facts (director, stage manager) from its own records.
