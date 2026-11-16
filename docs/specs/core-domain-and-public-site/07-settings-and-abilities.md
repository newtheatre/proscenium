# 6. Settings and abilities

## How to read this part

Both tables use the layouts the foundations draft fixes. Every default is a proposal for Matt to confirm, not a decision. Where no sensible default exists the setting ships unset, and the feature that needs it says so by name.

Settings are site-wide. Where a value varies by record, such as a performance's doors time, it is a column on the record whose starting value comes from a setting.

## Settings: organisation

| Key | Kind | Default | Limits | Changed by | Audience | Quotable | Purpose |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `core.organisation.name` | text | unset | 1 to 80 characters | `core.organisation.edit` | public | Yes | The theatre's name everywhere |
| `core.organisation.short-name` | text | unset | up to 30 characters | `core.organisation.edit` | public | Yes | Used where space is tight: text messages, the passkey prompt |
| `core.organisation.time-zone` | choice | unset | An IANA zone name | `core.organisation.edit` | public | No | Every date shown, and the operating day |
| `core.organisation.locale` | choice | `en-GB` | Shipped languages | `core.organisation.edit` | public | No | Language and date format |
| `core.organisation.currency` | choice | `GBP` | ISO 4217 codes | `core.organisation.edit` | public | No | Every money value. Refused once any money has been recorded. |
| `core.organisation.day-rollover` | time | 04:00 | 00:00 to 08:00 | `core.organisation.edit` | staff | No | When one operating day ends and the next begins |
| `core.organisation.week-start` | choice | monday | monday, sunday, saturday | `core.organisation.edit` | public | No | Calendars |
| `core.organisation.country` | choice | `GB` | ISO country codes | `core.organisation.edit` | staff | No | Which public holidays to import |
| `core.organisation.contact-email` | text | unset | An email address | `core.organisation.edit` | public | Yes | Public contact. A role address, not a person's. |
| `core.organisation.contact-phone` | text | unset | up to 30 characters | `core.organisation.edit` | public | Yes | Public contact |
| `core.organisation.address` | text | unset | up to 300 characters | `core.organisation.edit` | public | Yes | Postal address on the contact component and on receipts |
| `core.organisation.social-links` | custom | empty | A list of a network and an address | `core.organisation.edit` | public | No | The social links component. Custom because each item is a pair. |
| `core.organisation.legal-name` | text | unset | up to 120 characters | `core.organisation.edit` | public | Yes | Footer and receipts, where it differs from the name |
| `core.organisation.charity-number` | text | unset | up to 30 characters | `core.organisation.edit` | public | Yes | Footer, where the theatre is a charity |

The 04:00 rollover is Proscenium's show-night rule (its decision 0014), here as a default a theatre can change.

## Settings: brand

| Key | Kind | Default | Limits | Changed by | Audience | Quotable | Purpose |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `core.brand.accent` | colour | A neutral blue | A hex colour | `core.branding.edit` | public | No | The one colour everything derives from |
| `core.brand.neutral` | choice | `slate` | slate, stone, zinc, neutral | `core.branding.edit` | public | No | The tone of greys: cool, warm or plain |
| `core.brand.display-font` | choice | `system` | The bundled fonts, or `system` | `core.branding.edit` | public | No | Headings in the public shell |
| `core.brand.radius` | choice | `medium` | none, small, medium, large | `core.branding.edit` | public | No | How rounded corners are |
| `core.brand.default-mode` | choice | `auto` | auto, light, dark | `core.branding.edit` | public | No | The mode a first-time visitor sees |
| `core.brand.credit-line` | boolean | true |  | `core.branding.edit` | public | No | Shows "Powered by Proscenium" in the public footer |
| `core.brand.revision` | integer | 0 | Managed | Nobody: raised on save | public | No | Cache-busting for the stylesheet and logos |

How deep branding should go is question 3.

## Settings: programme

| Key | Kind | Default | Limits | Changed by | Audience | Quotable | Purpose |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `core.programme.doors-before` | duration | 30m | 0m to 3h | `core.programme.configure` | public | Yes | Starting value for when doors open before a performance |
| `core.programme.default-running-time` | duration | 2h | 10m to 8h | `core.programme.configure` | staff | No | Starting value for a new performance's end time |
| `core.programme.listing-grace` | duration | 0m | 0m to 6h | `core.programme.configure` | staff | No | How long after it starts a performance stays on what's on |
| `core.programme.archive-seasons` | boolean | true |  | `core.programme.configure` | staff | No | Archive a season automatically once it ends |
| `core.programme.advisories-collapsed` | boolean | true |  | `core.programme.configure` | public | No | Hide advisories behind a "show" control, so they do not spoil the plot for those who do not want them |
| `core.programme.credits-public` | boolean | true |  | `core.programme.configure` | public | No | Starting value for whether a new production's credits are public (question 5) |
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
| `core.notifications.max-attempts` | integer | 5 | 1 to 10 | `core.notification.configure` | staff | No | Tries before a delivery fails for good |
| `core.notifications.first-retry` | duration | 2m | 1m to 1h | `core.notification.configure` | staff | No | Wait before the first retry. Each later wait is four times the last. |
| `core.notifications.stuck-after` | duration | 10m | 5m to 2h | `core.notification.configure` | staff | No | When a queued or sending delivery is treated as stuck |
| `core.notifications.digest-time` | time | 08:00 | Any | `core.notification.configure` | signed-in | No | When daily digests go out |
| `core.notifications.digest-day` | choice | monday | A day of the week | `core.notification.configure` | signed-in | No | When weekly digests go out |
| `core.notifications.log-retention` | duration | 400d | 30d to 2555d | `core.notification.configure` | staff | No | How long the delivery log is kept |
| `core.notifications.inbox-retention` | duration | 180d | 30d to 730d | `core.notification.configure` | signed-in | No | How long an inbox message stays |
| `core.notifications.email-footer` | text | unset | up to 500 characters | `core.template.edit` | staff | No | Text under every email, such as a registered address |

400 days keeps one full year of sends plus a month, so "did last year's renewal reminder go out?" can be answered.

## Settings: public site

| Key | Kind | Default | Limits | Changed by | Audience | Quotable | Purpose |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `public-site.search.hidden` | boolean | true until setup completes, then false |  | `public-site.site.configure` | public | No | Ask search engines to stay away |
| `public-site.meta.title-pattern` | text | \`{page} | {name}\` | Must contain `{page}` | `public-site.site.configure` | public | No |
| `public-site.archive.from-year` | integer | unset | 1800 to this year | `public-site.site.configure` | public | Yes | The earliest year the archive shows. Unset shows everything. |
| `public-site.listing.cancelled-visible` | boolean | true |  | `public-site.site.configure` | public | No | Keep cancelled performances visible until their date passes |
| `public-site.feeds.calendar` | boolean | true |  | `public-site.site.configure` | public | No | Offer the calendar feed |
| `public-site.data.open` | boolean | true |  | `public-site.site.configure` | public | No | Offer the published programme as open data |

**One rule across settings:** `core.notifications.stuck-after` must be longer than `core.notifications.first-retry`.

## Abilities

| Ability | Acts on | Risk | Owner | Implies | Purpose | Suggested holders |
| --- | --- | --- | --- | --- | --- | --- |
| `core.production.view` | `core.production` | normal | ignored |  | See productions that are not yet public, and the console programme screens | Every member of staff |
| `core.production.create` | site | normal |  | `production.view` | Start a new production | Programme manager |
| `core.production.edit` | `core.production` | normal | ignored | `production.view` | Edit details, credits, media, advisories. Delete a draft. | Programme manager; a production's own team, by a grant on that production |
| `core.production.publish` | `core.production` | normal | ignored | `production.edit` | Publish and withdraw | Programme manager, marketing |
| `core.production.cancel` | `core.production` | privileged | ignored | `production.view` | Cancel a whole production | Theatre manager |
| `core.performance.schedule` | `core.production` | normal | ignored | `production.view` | Add, schedule, reschedule and move performances; change capacity | Programme manager |
| `core.performance.cancel` | `core.production` | privileged | ignored | `production.view` | Cancel or reinstate a performance | Theatre manager, duty manager |
| `core.season.manage` | site | normal |  |  | Create, edit, publish and archive seasons | Programme manager |
| `core.venue.manage` | site | normal |  |  | Venues and spaces | Theatre manager |
| `core.closure.manage` | site | normal |  |  | Closures | Theatre manager |
| `core.vocabulary.manage` | `core.vocabulary` | normal | ignored |  | Add, rename, reorder, retire and merge terms | Administrator; a module's manager, by a grant on that vocabulary |
| `core.file.manage` | site | normal |  |  | The file library: see every file, restore, delete | Administrator |
| `core.file.configure` | site | normal |  |  | File settings | Administrator |
| `core.branding.edit` | site | privileged |  |  | Change the brand | Administrator, marketing |
| `core.organisation.edit` | site | privileged |  |  | Organisation settings | Administrator |
| `core.programme.configure` | site | normal |  |  | Programme settings | Programme manager |
| `core.template.edit` | site | normal |  |  | Message wording | Marketing, administrator |
| `core.sender.manage` | site | privileged |  |  | Sender identities and the sending domain | Administrator |
| `core.delivery.read` | site | privileged |  |  | The delivery log and health screens. Lift a suppression. Retry a delivery. | Administrator |
| `core.notification.configure` | site | normal |  |  | Notification settings | Administrator |
| `public-site.readiness.view` | site | normal |  |  | The site-readiness screen | Administrator, marketing |
| `public-site.site.configure` | site | normal |  |  | Public site settings | Administrator, marketing |

Notes on the choices:

- **Scheduling and cancelling act on the production, not the performance.** A new performance has no record to check against yet, and a grant on a production should cover all its dates.
- **Cancelling is privileged and scheduling is not.** Cancelling is the one programme action that reaches ticket holders and money.
- **Branding is privileged** because the brand appears on the sign-in screen. This is where Flytower's passkey check on saving the brand comes from.
- **The delivery log is privileged** because it shows who was sent what.
- **No role is named in any module.** "Suggested holders" are for the presets, which workstream 2 and the integrating thread own.
- **Uploading a file needs no ability of its own.** It needs the ability to edit the record the file is going onto.

## Facts

Core declares one, at workstream 2's request.

| Fact | Record type | Standing | Holds when |
| --- | --- | --- | --- |
| `core.production-team` | `core.production` | Yes | The account is linked to a credit on the production, from the moment the credit is linked until `core.programme.team-standing-after` has passed since the production's last performance ended (duration, default 30d, 0d to 365d, changed by `core.programme.configure`). A production with no performances yet counts as current. |

Standing means that holding it puts the person on the members' side of their account, so a cast member sees the members' area without anyone granting a role.

**The fact grants nothing by default.** A credit is a public record, and a name on a cast list should not quietly carry editing rights. A theatre maps abilities to the fact on workstream 2's permission screen if it wants its teams to edit their own production. Workstream 2's preset roles `production-lead` and `visiting-company`, scoped to one production, are the suggested holders of `core.production.edit` and `core.performance.schedule` on that production.

The later production-management module may declare finer facts (director, stage manager) from its own records.
