# 6. Settings and abilities

Fourteen settings and fifteen abilities, written as entries for the foundations settings and abilities registries. Labels and help text are translation keys derived from each name. An entry marked "later" matters only to a mailing or an import and is declared with the story that needs it; the rest are in the first release.

## Settings

Every setting applies to the whole site. What varies by list is a field on the list that defaults from a setting, as the integration thread recommended for every module.

**Where they are shown.** The manifest declares five groups in `settingGroups`, one for each first segment of a key. Four of them, `consent`, `sending`, `campaigns` and `imports`, have `place: 'console'`, name no page and so are drawn on the module's own generated page, `/console/communications/settings`. The fifth, `engine`, holds the three engineering limits (`tranche-size`, `stuck-after` and `results-after`) and is marked `advanced: true`, so it is drawn on `/admin/advanced` under the module's name and not on the module's page. Every group has `change: 'communications.settings.manage'`, and none names a bespoke `screen`. Each setting therefore has exactly one home.

**Saving.** Two settings declare `onChange: 'confirm'`, because each changes whom the theatre may write to: `communications.consent.double-opt-in` and `communications.consent.existing-customer`. Saving either shows what will change and asks again, with re-authentication when the session is not fresh. Every other setting saves with no prompt.

**Durations.** Each duration is entered with the kit's `DurationInput`, a number and a unit, and stored as whole seconds. A month is 30 days and a year is 365 days, so the default of 13 months is 390 days and 6 years is 2,190 days. A stored value is shown in the largest unit that divides it exactly, so no label or help text names a unit: "How long consent records are kept", never "Years to keep consent records".

| Key | Kind | Default | Bounds | Quotable | What it controls |
| --- | --- | --- | --- | --- | --- |
| `communications.consent.double-opt-in` | toggle | on |  | no | Whether an unproved address must confirm. A list may override it |
| `communications.consent.confirm-window` | duration | 7 days | 1 to 30 days | yes | How long a confirm link works |
| `communications.consent.record-retention` | duration | 6 years | 1 to 10 years | yes | How long consent records are kept after a subscription ends |
| `communications.consent.existing-customer` | toggle | off |  | no | Whether a list may use the existing-customer basis. Later |
| `communications.engine.tranche-size` | number | 50 | 10 to 90 | no | Recipients handed to core in one unit of work, as one set. Never above `core.units.set-rows-limit` |
| `communications.sending.per-minute` | number | 120 | 10 to 1,000 | no | The most recipients of a mailing handed to core each minute. Later |
| `communications.sending.daily-limit` | number | 0 (none) | 0 to 1,000,000 | no | A cap across all mailings in a day. Notices are never capped. Later |
| `communications.sending.quiet-start` | time of day | 21:00 |  | no | Scheduled mailings do not start after this. Later |
| `communications.sending.quiet-end` | time of day | 08:00 |  | no | Or before this. Equal values switch quiet hours off. Later |
| `communications.engine.stuck-after` | duration | 30 minutes | 10 minutes to 6 hours | no | When the health check reports a campaign with no progress |
| `communications.engine.results-after` | duration | 72 hours | 1 hour to 14 days | no | When final counts are copied even if core still has deliveries retrying |
| `communications.campaigns.require-approval` | toggle | off |  | no | Whether a mailing needs a second person. Later |
| `communications.campaigns.recipient-retention` | duration | 13 months | 1 to 36 months | yes | How long recipient rows are kept after a campaign finishes |
| `communications.imports.file-retention` | duration | 30 days | 1 to 90 days | no | How long an import file is kept. Later |

Rules across settings:

- `tranche-size` is bounded twice. A tranche is written set-wise from one JSON parameter, as Foundations rules for any fan-out, so it may never exceed `core.units.set-rows-limit`; and one unit of work is one D1 batch. Proof P-COM-1 in part 8 fixes the safe ceiling.
- `per-minute` is a throttle on what this module hands over, not on what the provider accepts. Its default and that of `daily-limit` are set by proof P-COM-2 when mailings are built.
- Quiet hours are in the theatre's time zone, from `getOrganisation()`.
- Nothing here repeats a core setting. The sending domain, the sending label and the email footer are core's `core.notifications.*`, managed on core's Email screen. Attempts, retries and how long the delivery log is kept are core's `core.delivery.*`.

### Presets

| Theatre type | Differences from the defaults |
| --- | --- |
| Student or volunteer society | None |
| Small professional venue | `require-approval` on |
| Venue with a parent body | `require-approval` on; `record-retention` left for the body's policy |

## Abilities

| Ability | Record type | Risk | Fresh | Audit | Allows |
| --- | --- | --- | --- | --- | --- |
| `communications.list.read` | communications.list | low | no |  | See lists and their counts |
| `communications.list.manage` | communications.list | elevated | no | write | Create, edit and archive a list; publish consent wording |
| `communications.subscriber.read` | communications.list | elevated | no | read | See who is on a list and a campaign's recipients |
| `communications.subscriber.manage` | communications.list | elevated | no | write | Add or remove one person, with a statement |
| `communications.subscriber.import` | communications.list | privileged | yes | write | Import a file of subscribers. Later |
| `communications.subscriber.export` | communications.list | privileged | yes | read | Export a list's subscribers |
| `communications.consent.read` | core.account | elevated | no | read | See one person's subscriptions and consent history |
| `communications.campaign.read` | communications.campaign | low | no |  | See campaigns, content and counts |
| `communications.campaign.edit` | communications.campaign | low | no | write | Write and edit drafts; send a test to oneself |
| `communications.campaign.send` | communications.campaign | elevated | no | write | Schedule, pause and cancel a mailing. Later |
| `communications.campaign.approve` | communications.campaign | elevated | no | write | Approve another person's mailing. Later |
| `communications.notice.send` | communications.campaign | elevated | no | write | Write and send a notice |
| `communications.template.manage` | none | low | no | write | Create and edit mailing templates. Later |
| `communications.settings.manage` | none | elevated | no | write | Change this module's settings |
| `communications.own.manage` | none | low | no |  | Manage one's own subscriptions. Held by every signed-in account |

Notes on the entries:

- **Scope.** List abilities may be granted at the level of one list. A campaign's parent is its list, so a grant on a list covers its mailings. A notice has no list: `communications.notice.send` is granted site-wide or checked together with the audience source's own ability on its record, so someone who may message Friday's ticket holders needs box office's say as well as this module's.
- **Read auditing.** The three abilities marked read write an audit row each time they show people, under identity's ruling that an ability may declare `audit: 'read'`.
- **Fresh.** Import and export move many people's details at once, so they ask for a fresh sign-in.
- **Assurance.** Privileged abilities default to strong, as the abilities registry rules.
- **No lockout by declaration.** "The author cannot approve" is a guard in the service, not an ability rule.
- **Facts.** The module declares none. A theatre may map `communications.notice.send` to another module's fact, such as front of house's on-shift duty manager, so the person running tonight can tell tonight's audience.

**Implied ability.** `communications.subscriber.read` declares `implies: ['core.account.find']`. It guards the two lists that can be narrowed by account holder, a list's subscribers and a campaign's recipients, and `core.account.find` is the ability on identity's `findAccounts`. Core declares it `impliable: true` at risk standard, and this module requires core, so the declaration meets the abilities registry's rule. No other ability here implies another. "Add a person" uses identity's person picker under `core.account.search`, which the preset roles with console work already hold.

### Suggested role mapping

Identity owns the preset roles. This is the mapping this module proposes for them.

| Role | Abilities |
| --- | --- |
| Owner | All |
| Administrator | All except none; settings included |
| Marketing or publicity lead | list.read, list.manage, subscriber.read, subscriber.manage, subscriber.import, campaign.\*, template.manage |
| Marketing assistant | list.read, campaign.read, campaign.edit, template.manage |
| Box office manager | campaign.read, notice.send, consent.read |
| Duty manager | notice.send, scoped by the on-shift fact where front of house is on |
| Member, audience | own.manage |

## What a person can always do without any ability

- Confirm, leave or rejoin by a token link.
- See and change their own subscriptions when signed in.
- Download their subscriptions and consent history with the rest of their data, through identity's download.
