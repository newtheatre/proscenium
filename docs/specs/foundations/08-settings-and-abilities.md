# 6. Settings and abilities

## Foundations' own settings and abilities

Foundations defines the registries; it also uses them. These are the settings and abilities of the system area of `core`, written in the registry layouts. Identity, the core domain and the interface add their own `core.*` entries in their documents, so no table here is the whole of `core`.

Revised on 16 November 2026 after the consistency review: the freshness window is `core.access.fresh-within`, the name and locale settings are confirmed as foundations' (the core domain keeps only its additional `core.organisation.*` keys), and every table follows the registry layouts.

## Settings

No operational number is fixed in code. Defaults are proposals a theatre can change within the limits shown. Every setting here is changed with `core.setting.change` unless the row says otherwise.

| Key | Kind | Default | Limits | Changed by | Audience | Quotable | Purpose |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `core.site.name` | text | unset | 1 to 80 characters | `core.setting.change` | public | yes | The theatre's name. Set at setup |
| `core.locale.time-zone` | choice | unset | any IANA zone | `core.setting.change`, with confirmation that shows the tasks and deadlines that will move | public | no | The theatre's time zone. Set at setup; until then scheduled tasks use UTC and no domain date is computed |
| `core.locale.currency` | choice | `GBP` | ISO 4217 | `core.setting.change` | public | no | The one currency. Refused once any money has been recorded |
| `core.locale.language` | choice | `en-GB` | the shipped catalogues | `core.setting.change` | public | no | The one language setting |
| `core.locale.day-start` | time | `04:00` | 00:00 to 08:00 | `core.setting.change`, with confirmation | staff | no | The hour a show night ends, so a late finish belongs to the right day |
| `core.updates.channel` | choice | `stable` | stable, beta | deployment (`site.config.ts`), shown read-only | staff | no | Which releases the theatre is offered |
| `core.updates.apply-migrations` | choice | `button` | button, automatic | `core.update.apply` | staff | no | Whether an administrator presses Apply or migrations apply by themselves |
| `core.audit.retention` | duration | 7 years | 1 to 25 years | `core.setting.change`, with a reason | staff | yes | How long audit entries are kept |
| `core.jobs.retention` | duration | 30 days | 7 to 365 days | `core.setting.change` | staff | no | How long finished jobs and task runs are kept |
| `core.jobs.max-attempts` | integer | 5 | 1 to 10 | `core.setting.change` | staff | no | Attempts before a job is dead; a job may declare its own |
| `core.health.notify` | boolean | true |  | `core.setting.change` | staff | no | Tell the Owner when a check keeps failing |
| `core.health.notify-after` | duration | 24 hours | 1 hour to 7 days | `core.setting.change` | staff | no | How long a check must fail before the Owner is told |
| `core.access.fresh-within` | duration | 10 minutes | 1 minute to 1 hour | `core.setting.change`, with confirmation | staff | no | How recent a sign-in must be for an ability that needs a fresh one. The only freshness window; identity reads it and has withdrawn its own key |
| `core.maintenance.message` | text | a plain default | up to 280 characters | `core.setting.change` | public | no | Shown while migrations are pending |
| `core.rate-limits.<class>` | rate | see the table of classes below | 1 to 10,000 in a period of 1 minute to 1 day | `core.setting.change`, with confirmation | staff | no | The allowance for one rate-limit class |

"With a reason" and "with confirmation" are the registry field `onChange: 'reason'` and `onChange: 'confirm'` (added to the settings registry on 16 November; the field `change` remains the ability).

The core domain's calendar helpers read `core.locale.time-zone` and `core.locale.day-start`. The core domain declares only the organisation settings that are additional to these, under `core.organisation.*`.

Kit limits that are not a theatre's business (statements per unit, bound parameters per statement, back-off base) are constants in the kit with a comment citing the platform limit, not settings.

## Abilities

| Ability | Acts on | Risk | Owner | Implies | Purpose | Suggested holders |
| --- | --- | --- | --- | --- | --- | --- |
| `core.module.view` | site | normal |  |  | See the Modules screen | Owner, administrator |
| `core.module.switch` | `core.module` | privileged |  | `core.module.view` | Switch a module on or off | Owner |
| `core.setting.view` | site | normal |  |  | See settings; a sensitive value is never shown to anyone | Owner, administrator |
| `core.setting.change` | `core.setting` | normal |  | `core.setting.view` | Change a setting. Granted for the site or for one module's settings through the parent link. A setting may name a narrower ability of its own module in `change` | Owner, administrator |
| `core.setting.import` | site | privileged |  | `core.setting.change` | Import a settings file | Owner |
| `core.job.view` | site | normal |  |  | See jobs and task runs | Owner, administrator |
| `core.job.manage` | `core.job` | normal |  | `core.job.view` | Retry, cancel, run a task now | Owner, administrator |
| `core.credential.view` | site | normal |  |  | See which credentials are set, never a value | Owner, administrator |
| `core.credential.change` | `core.credential` | privileged |  | `core.credential.view` | Set or clear a credential; audited without the value | Owner |
| `core.health.view` | site | normal |  |  | See the Health screen | Owner, administrator |
| `core.update.apply` | site | privileged |  | `core.health.view` | Apply migrations | Owner |
| `core.signing-key.retire` | site | privileged |  | `core.health.view` | Retire a signing key at once | Owner |
| `core.audit.view` | site | privileged, `fresh: false`, `audit: 'read'` |  |  | Search the audit trail; every search is itself recorded | Owner, administrator |
| `core.audit.export` | site | privileged |  | `core.audit.view` | Download audit entries | Owner |

Risk is `normal` or `privileged`, as the abilities registry defines. A privileged ability needs a strong session, and a fresh sign-in unless it only reads. None of these record types has an owner column, so the Owner column is empty throughout. The suggested holders are identity's preset roles; there is no data-protection role, so the administrator preset is the suggested second holder of the audit trail. None of these abilities can be reached through a fact: system authority is never derived from a shift or a training record.

## Record types

| Record type | Table | Parent | Owner column |
| --- | --- | --- | --- |
| `core.module` | `core_modules` | none | none |
| `core.setting` | `core_settings` | `core.module` (the declaring module) | none |
| `core.job` | `core_jobs` | `core.module` | none |
| `core.credential` | `core_credentials` | `core.module` | none |

The parent link is what lets a module's manager be granted `core.setting.change` on that module's settings alone. "Per settings group" in the interface's document means exactly this: per declaring module.

## Secrets

This table is the single index of every secret in `core`, whichever area declares it. The setup check and the Health screen read the whole table. A switchable module's secrets are in its own document and manifest.

| Secret | Declared by | Needed | Purpose |
| --- | --- | --- | --- |
| `CORE_ENCRYPTION_KEY` | foundations | always | The one key that encrypts stored credentials, signing keys, every column of class special and every column declared `encrypted: true`. Generated by the theatre at setup, held as a deployment secret and in its password manager. Every encrypted value records the key version; during a rotation the old key is held as `CORE_ENCRYPTION_KEY_PREVIOUS` until a task has re-encrypted everything. No area or module brings a key of its own |
| `CORE_SETUP_CODE` | foundations | until an Owner exists | Proves the person at `/setup` is the person who deployed |
| `CORE_TURNSTILE_SECRET_KEY` | identity | when-used | The challenge on public forms and sign-in (verified by core) |
| `CORE_SESSION_KEY` | identity | always | As declared in identity's document |
| `CORE_GOOGLE_CLIENT_SECRET` | identity | when-used | As declared in identity's document |
| `CORE_OWNER_RECOVERY` | identity | when-used | As declared in identity's document |

**As built (17 and 19 November 2026); this prevails over the table and the paragraph below.** Only `CORE_ENCRYPTION_KEY`, `CORE_SESSION_KEY` and `CORE_OWNER_RECOVERY` are Worker secrets. `CORE_TURNSTILE_SECRET_KEY`, `CORE_GOOGLE_CLIENT_SECRET` and `CORE_CLOUDFLARE_TOKEN` are credentials saved in the app (Admin > Sign-in and Admin > Email sending), as are every module's provider and list keys; the Turnstile site key is the public setting `core.sign-in.turnstile-site-key`. Matt ruled on 19 November that nothing the site can hold is set on the Worker, so a credential is never read from a Worker secret of the same name. A site that still has one is moved over once by the cron tick (the kit's "Secrets and keys"). `CORE_SETUP_CODE` is not built: `/setup` is open only while no Owner exists. `CORE_SITE_ORIGIN` is a Worker variable, not a secret, kept as the escape when the recorded address is wrong.

**One optional secret, added 16 November 2026 at Matt's request for automatic setup of the sending domain (core domain's story C-52):** `CORE_CLOUDFLARE_TOKEN`, a Cloudflare API token limited to Email Sending edit and Zone read on the theatre's own zone. When it is absent everything stays a manual setup step and nothing fails. It is never shown, logged or stored anywhere but the secret; the health check reports only whether it is present and can read the zone; the call that creates the sending subdomain goes through `externalCall`. It is the only secret that can act on the theatre's Cloudflare account, so its permissions are never widened without a decision.

## Rate-limit classes

A route names a class. Each allowance is the setting `core.rate-limits.<class>`; the figures are proposals.

**What each class counts by (as built, 16 November 2026).** A route's class counts by the signed-in account, or by the network address when nobody is signed in. `sign-in` also counts by the email address typed, and over either limit the person sees the same quiet "sent" screen. `presented-value` counts each check twice, by session and by network address, and over either the check is refused. Since 18 November 2026 the sign-in steps that every visitor takes (opening the sign-in page, asking for a code, using a code or link, a passkey or a provider) count against `sign-in-network` by network address, and the strict `sign-in` allowance is counted for the email address typed (asking) and for the email address from that network address (using a code). The `sign-in`, `sign-in-network`, `public-form` and `presented-value` classes count in the shared counter (a SQLite-backed Durable Object, so it runs on Cloudflare's free plan; an object clears its storage when its window ends); the others count in memory. The shipped figures are in the Formats tab's fourth "As built" list and prevail over the proposals below.

| Class | Counted per | Proposed allowance | Used for |
| --- | --- | --- | --- |
| `default` | account or network address | 600 a minute | Reads |
| `write` | account | 120 a minute | Any change |
| `sign-in` | email address and network address | 10 in 10 minutes | Sign-in and sign-up |
| `sign-in-network` | network address | 200 in 10 minutes | The sign-in steps many people on one network take (passkey options, asking for and using an emailed code or link); added 18 November 2026 so a theatre's shared Wi-Fi does not lock people out |
| `public-form` | network address | 20 in 10 minutes | Forms open to people with no account |
| `export` | account | 10 an hour | Downloads of many records |
| `presented-value` | session and network address | 10 in 10 minutes | Requirement checks that carry a typed value |

`sign-in`, `public-form` and `presented-value` must count in a shared store before the first release (story F-36).
