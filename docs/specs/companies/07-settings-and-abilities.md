# 6. Settings and abilities

Companies declares 11 settings, 20 abilities (15 for staff, 5 held only through the fact `companies.contact-of`) and no new role preset. Every setting holds one value for the whole theatre; a value that varies by engagement is a column on the agreement that falls back to the setting. All settings are changed by holders of `companies.settings.manage` on the module's page under Admin > Modules. One declares onChange confirm: `companies.contacts.keep-for`, because shortening it lets the next sweep remove contact links that would otherwise have been kept.

## Settings

Defaults are proposals for the workshops; none is NNT policy until confirmed (part 9, Q6).

| Key | Kind | Default | Range | Group | Audience | Meaning |
| --- | --- | --- | --- | --- | --- | --- |
| `companies.agreements.required` | boolean | false |  | Agreements | staff | A visiting or hire engagement needs an accepted agreement to be confirmed (E3). Acts from a call never do |
| `companies.agreements.default-clauses` | text | unset | Markdown, 20000 characters | Agreements | staff | The clauses a new agreement starts with: get-in rules, insurance, licence held by the company, recording |
| `companies.guests.default-places` | integer | 2 | 0 to 50 | Guests | staff | Guest places per performance a new agreement offers |
| `companies.guests.names-due` | duration | 24h | 1h to 14d | Guests | members | How long before a performance guest names are due (L1) |
| `companies.guests.remind-before` | duration | 48h | 0m to 14d | Guests | staff | When contacts with unnamed places are reminded; 0m sends none |
| `companies.guests.keep-unnamed` | boolean | false |  | Guests | staff | Unnamed places stay held for the box office after the deadline instead of going on sale (L5) |
| `companies.settlements.due-within` | duration | 14d | 1d to 90d | Settlements | members | How long after the last date a settlement is due, unless the agreement says |
| `companies.settlements.approve-without-agreement` | duration | 14d | 1d to 60d | Settlements | members | After this long with no answer or query, a proposed settlement may be approved without the contact's agreement (S7) |
| `companies.contacts.keep-for` | duration | 730d | 90d to 2190d | Data | staff | How long an ended contact link is kept; onChange confirm |
| `companies.people.keep-for` | duration | 90d | 7d to 730d | Data | staff | How long company people are kept after the engagement's last date |
| `companies.merges.undo-for` | duration | 30d | 1d to 90d | Data | staff | How long a company merge can be undone (G5) |

**Preset differences.** `student-society`: module off; `companies.guests.default-places` 2. `small-venue`: module on; `companies.agreements.required` true. `amateur-company`: module on; defaults as listed.

## Abilities

| Ability | Acts on | Risk | Owner | Implies | Purpose | Holders in the presets |
| --- | --- | --- | --- | --- | --- | --- |
| `companies.company.view` | `companies.company` | normal |  |  | See companies, contacts' names and roles, engagements in outline. Not audited | `administrator`, `committee-member`, `box-office-manager`, `technical-manager` |
| `companies.company.manage` | `companies.company` | normal |  | `company.view`; `core.account.find` | Add and edit companies, archive and restore | `administrator` |
| `companies.company.merge` | `companies.company` | privileged |  | `company.manage` | Merge two companies, and undo a merge | `administrator` |
| `companies.contact.manage` | `companies.company` | normal |  | `company.view` | Add, change and end contacts; set the primary | `administrator` |
| `companies.contact.view-details` | `companies.company` | normal |  | `company.view` | See contacts' email and day-of phone. Audited as a read | `administrator`, `technical-manager`; front-of-house lead on tonight's confirmed shift, by fact |
| `companies.engagement.view` | `companies.engagement` | normal |  | `company.view` | See an engagement in full: calls, people, guests, agreement terms | `administrator`, `technical-manager`, `box-office-manager` |
| `companies.engagement.manage` | `companies.engagement` | normal |  | `engagement.view` | Open, change, confirm and cancel engagements; calls, people, tech notes | `administrator`; `technical-manager` for calls only, by a grant scoped to a venue |
| `companies.agreement.manage` | `companies.engagement` | normal |  | `engagement.view` | Draft, send, supersede and withdraw agreements | `administrator` |
| `companies.agreement.record` | `companies.engagement` | normal | refuses | `agreement.manage` | Record an answer given on paper, with the file | `administrator` |
| `companies.allocation.manage` | `companies.engagement` | normal |  | `engagement.view` | Change places for one performance; name guests for a contact | `administrator`, `box-office-manager` |
| `companies.settlement.view` | `companies.engagement` | normal |  | `engagement.view` | See settlements and their figures | `administrator`, `finance-officer` |
| `companies.settlement.prepare` | `companies.engagement` | normal |  | `settlement.view`; `finance.ledger.view` on the production | Make, change and propose settlement drafts; answer queries | `finance-officer` |
| `companies.settlement.approve` | `companies.settlement` | privileged | refuses | `settlement.view` | Approve a settlement; never one you prepared (S7) | `finance-officer`, `owner` |
| `companies.settlement.record-payment` | `companies.settlement` | privileged |  | `settlement.view` | Record money paid or received against a settlement while Invoices is off | `finance-officer` |
| `companies.settings.manage` | site-wide | privileged |  |  | Change the settings above | `administrator` (and `owner`, which holds everything) |
| `companies.engagement.view-own` | `companies.engagement` | normal |  |  | A contact's view of their engagement | Fact `companies.contact-of` |
| `companies.guest.name` | `companies.engagement` | normal |  | `engagement.view-own` | Name and withdraw guests before the deadline | Fact `companies.contact-of` |
| `companies.people.manage-own` | `companies.engagement` | normal |  | `engagement.view-own` | Add and change company people until the first date (D3) | Fact `companies.contact-of` |
| `companies.agreement.answer` | `companies.engagement` | normal |  | `engagement.view-own` | Accept or decline a sent agreement | Fact `companies.contact-of` |
| `companies.settlement.answer` | `companies.engagement` | normal |  | `engagement.view-own` | Agree or query a proposed settlement | Fact `companies.contact-of` |

"Owner: refuses" means the holder cannot act on a record they made: `agreement.record` cannot record an answer to an agreement they sent, and `settlement.approve` cannot approve a settlement they prepared, checked on the statement. Owners are exempt from the own-record rule by Matt's ruling of 23 November 2026, except `settlement.approve`, where a second pair of eyes is the point (part 9, Q7).

## Preset mappings

There is no new role: preset keys are fixed at fifteen (R-03, ruling R3-11). The manifest's `presets` role mappings put the five fact-held abilities (`engagement.view-own`, `guest.name`, `people.manage-own`, `agreement.answer`, `settlement.answer`) on the existing `visiting-company` key. `companies.contact-of` maps onto that key, so nobody is granted it by default. The staff abilities go to the existing keys named in the table above. Approving a settlement needs a second person, and that binds owners too (ruling R3-17).

**`programmer`** (the sixteenth preset, chosen by Matt for Programme planning, granted on a season or site-wide) also holds `companies.company.view`, `company.manage`, `contact.manage`, `engagement.view` and `engagement.manage`. That lets a programmer open and link engagements, and an engagement with a season appears in Programme planning's tray through Companies' `programme-planning.entry-source` contribution, so nothing more is needed to put it forward for a slot. Agreements, guests and settlements stay with the roles in the table.
