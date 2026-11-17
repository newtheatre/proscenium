# 6. Settings and abilities

The two modules register 20 settings, 19 abilities, five record types and four facts, in the Foundations registry layouts. Anything that varies by scheme is a field of the scheme that starts from a setting, because a setting holds one value for the whole theatre.

## Where the settings are shown

Each manifest declares `settingGroups`, and every setting has exactly one home. No setting is managed on a bespoke screen.

| Module | Groups | Home |
| --- | --- | --- |
| `membership` | `applications`, `renewal`, `reminders`, `numbers`, `join`, `card`, `voting`, `verification`, `ending`, `help` | The module's own page, `/console/membership/settings`, place console |
| `membership` | `retention` | Marked `advanced`: drawn on `/admin/advanced` under the module's name |
| `membership-fees` | `checkout`, `refunds` and its other groups | The module's own page, `/console/membership-fees/settings`, place console |
| `membership-fees` | `retention` | Marked `advanced`: drawn on `/admin/advanced` under the module's name |

Each group's `change` ability is its module's settings ability, so each page shows one "Changed by people who can..." line. Six settings are declared `onChange: 'confirm'`, so saving one shows what will change, asks again, and asks for a fresh sign-in when the session is not fresh:

| Setting | Why a silent change would matter |
| --- | --- |
| `membership.voting.qualifying-period` | Shortening it widens who may vote |
| `membership.verification.list-keep-for` | Shortening it removes list entries at the next sweep, which changes who is verified and who gets a member price by reference |
| `membership.retention.ended-after` | Shortening it anonymises ended memberships that cannot be brought back |
| `membership-fees.refunds.cooling-off` | It is a public promise of a full refund, shown on the join page |
| `membership-fees.retention.charges` | Shortening it removes charge rows that cannot be brought back |
| `membership.verification.names-keep-for` | Shortening it erases names from list entries at the next sweep. Every setting whose value is a retention period is confirmed, here as in every module |

No other setting asks for anything extra: the rest are starting values for new schemes, wording, or reminders, and a wrong value is put right by changing it back. Fee amounts and each scheme's verifier are not settings; they are changed on the scheme's own screen under their own abilities and are audited there. None is declared `'reason'`. Every `duration` setting is entered with the kit's `DurationInput` (a number and a unit, a month being 30 days and a year 365); the stored value and the defaults and limits written below are unchanged.

## Settings of `membership`

Changed by `membership.settings.manage`. Audience is staff unless stated.

| Key | Kind | Default | Limits | Audience | Quotable | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| `membership.applications.expire-after` | duration | 14d | 1d to 90d | public | Yes | How long an application may wait on the applicant before it expires |
| `membership.renewal.opens-before` | duration | 30d | 0d to 180d | staff | No | What a new scheme's renewal window starts as |
| `membership.renewal.grace` | duration | 0d | 0d to 90d | staff | No | What a new scheme's grace starts as |
| `membership.reminders.first` | duration | 30d | 1d to 180d | staff | No | How long before the end the first renewal reminder is sent |
| `membership.reminders.final` | duration | 7d | 1d to 60d | staff | No | How long before the end the last reminder is sent |
| `membership.reminders.after-lapse` | boolean | true |  | staff | No | Whether a holder is told once that their membership has ended |
| `membership.numbers.prefix` | text | M- | 8 characters | public | No | Shown before a member number |
| `membership.join.public-listing` | boolean | true |  | public | No | Whether signed-out visitors can see the open schemes |
| `membership.card.show` | boolean | true |  | public | No | Whether My membership offers the full-screen card |
| `membership.voting.qualifying-period` | duration | 0d | 0d to 365d | public | Yes | How long somebody must have been a member before `membership.voter` holds |
| `membership.verification.list-keep-for` | duration | 400d | 30d to 800d | public | Yes | The longest an uploaded list's entries are kept |
| `membership.retention.ended-after` | duration | 2190d | 365d to 3650d | public | Yes | When an ended or lapsed membership is anonymised |
| membership.ending.by-holder | boolean | true | none | staff | No | What a new scheme's holder\_may\_end starts as. A theatre whose memberships are owned by another body turns it off |
| membership.help.link | text | empty | A path on the site, or a web or email address | public | No | Where "Have a membership? Contact us" points when a reference is not found (rule V15). Empty leaves the sentence without a link |
| membership.verification.names-keep-for | duration | 365d | 0d to 800d | public | Yes | How long after a list entry's end date its name is kept (rule V18) |

## Settings of `membership-fees`

Changed by `membership-fees.settings.manage`.

| Key | Kind | Default | Limits | Audience | Quotable | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| `membership-fees.checkout.pay-within` | duration | 30m | 10m to 2h | public | No | How long an online payment may take before its intent expires. The application itself stays open |
| `membership-fees.desk.enabled` | boolean | true |  | staff | No | Whether a fee may be taken at the desk |
| `membership-fees.refunds.cooling-off` | duration | 14d | 0d to 60d | public | Yes | The period after paying in which the theatre says it will refund in full. Shown on the join page. A theatre sets what its own law requires |
| `membership-fees.refunds.end-on-full-refund` | boolean | true |  | staff | No | Whether a full refund ends the membership |
| `membership-fees.retention.charges` | duration | 2555d | 2190d to 3650d | public | Yes | When a charge row is removed |

## Rules across settings

| Rule | Check |
| --- | --- |
| Reminders in order | `reminders.final` is shorter than `reminders.first` |
| Lists do not outlive their purpose | A list's `valid_until` may not be later than its upload date plus `verification.list-keep-for` |
| Charges outlive the books | `membership-fees.retention.charges` is at least Finance's retention for postings |
| The members' area exists | A members' scheme cannot be opened while Identity's `core.members-area.enabled` is off; the scheme screen says so and suggests a supporters' scheme |

## Scheme fields that start from a setting

| Scheme field | Starts from |
| --- | --- |
| `renewal_opens_days` | `membership.renewal.opens-before` |
| `grace_days` | `membership.renewal.grace` |
| holder\_may\_end | membership.ending.by-holder |

Changing the setting afterwards changes new schemes only.

## Record types

| Record type | Table | Parent | Owner column | Grantable scope |
| --- | --- | --- | --- | --- |
| `membership.scheme` | `membership_schemes` | none | none | Yes: a grant may be scoped to one scheme, so a "Friends co-ordinator" manages only the Friends |
| `membership.membership` | `membership_memberships` | `membership.scheme` | `account_id` | No |
| `membership.verification-list` | `membership_verification_lists` | none | none | No |
| `membership-fees.price` | `membership_fees_prices` | `membership.scheme` | none | No |
| `membership-fees.charge` | `membership_fees_charges` | `membership.membership` | none | No |

A grant on one scheme covers its memberships, in the way the form builder's grants on a form cover its responses.

## Abilities of `membership`

Two abilities offer a search by person, the members list under `membership.membership.view` and the desk under `membership-fees.payment.take`. Each implies Identity's `core.account.find`, which is impliable and of standard risk, so no preset has to add it by hand. Abilities that imply `membership.membership.view` carry it with them.

| Ability | Acts on | Risk | Owner | Implies | Audit | Purpose | Suggested holders |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `membership.scheme.view` | `membership.scheme` | normal |  |  | No | See schemes, including drafts and closed ones | Membership officer, Administrator, Committee member, Box-office manager |
| `membership.scheme.manage` | `membership.scheme` | privileged |  | `scheme.view` | Yes | Create, edit, open, close and archive schemes; attach forms to them. Privileged because a scheme decides who gets the members' area | Administrator, Membership officer |
| `membership.membership.view` | `membership.membership` | normal | grants | `core.account.find` | read | See who holds what, with dates and status. A person always sees their own | Membership officer, Administrator, Committee member, Box-office staff |
| `membership.membership.add` | `membership.scheme` | normal | refuses | `membership.view` | Yes | Add a member directly | Membership officer, Administrator |
| `membership.membership.verify` | `membership.membership` | normal | refuses | `membership.view` | Yes | Pass or decline an application's verification | Membership officer, Administrator |
| `membership.membership.update` | `membership.membership` | normal | refuses | `membership.view` | Yes | Change dates and the staff note | Membership officer, Administrator |
| `membership.membership.end` | `membership.membership` | normal | grants | `membership.view` | Yes | End a membership. A holder ends their own where the scheme's holder\_may\_end allows it | Membership officer, Administrator |
| `membership.membership.export` |  | privileged |  | `membership.view` | Yes | Export a list of members | Membership officer, Administrator |
| `membership.verification-list.manage` | `membership.verification-list` | normal |  |  | Yes | Create, upload and delete verification lists; add or remove a single entry; search a list by name or number and redact a row | Membership officer, Administrator |
| `membership.settings.manage` |  | privileged |  |  | Yes | Change the settings above | Administrator |
| membership.verification-list.check | membership.verification-list | normal | none | none | read | Type a reference or address and be told whether it is on a list, until when and in whose name (rule V19); see the name behind a ticket bought by reference, through requirements.holder. Never shows the list | Membership officer, Administrator, Box-office manager, Box-office staff; stewards through the fact front-of-house.on-shift |
| membership.membership.import | membership.scheme | privileged | refuses | membership.add | Yes | Import members from a file (MEM-49): a dry run, then a bulk job. A row for one's own account is refused | Membership officer, Administrator |
| membership.card.check | membership.membership | normal | none | none | read | Be told whether another person's membership is current: scanning a membership card (MEM-51), and the requirement source's checkAbility, so a seller or steward may have a customer's member price checked | Membership officer, Administrator, Box-office manager, Box-office staff; stewards through the fact front-of-house.on-shift |

`owner: 'grants'` on view and end is what lets every person see and end their own membership with no role. `owner: 'refuses'` on add, verify and update stops a membership officer adding, passing or extending their own.

`membership.membership.view` is audited as a read, because the list of members is a list of people. Viewing one's own is not audited.

## Abilities of `membership-fees`

| Ability | Acts on | Risk | Owner | Implies | Audit | Purpose | Suggested holders |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `membership-fees.price.manage` | `membership.scheme` | privileged |  |  | Yes | Set a scheme's price and tax code | Finance officer, Administrator |
| `membership-fees.charge.view` | `membership-fees.charge` | normal | grants |  | No | See a membership's charge and payment | Membership officer, Finance officer, Administrator, Box-office manager |
| `membership-fees.payment.take` | `membership-fees.charge` | normal | refuses | charge.view, `core.account.find` | Yes | Take a fee at the desk | Membership officer, Box-office staff, Box-office manager |
| `membership-fees.charge.waive` | `membership-fees.charge` | privileged | refuses | `charge.view` | Yes | Mark a fee as waived, with a reason | Administrator, Finance officer |
| `membership-fees.refund.request` | `membership-fees.charge` | normal | refuses | `charge.view` | Yes | Ask for a refund. Approval follows Payments' own rule | Membership officer, Finance officer |
| `membership-fees.settings.manage` |  | privileged |  |  | Yes | Change the fees settings | Administrator, Finance officer |

Paying one's own fee online needs no ability: the route is declared `signed-in` and checks ownership of the membership.

## Facts

| Fact | On | Standing | True when |
| --- | --- | --- | --- |
| `membership.holder` | none | Yes | A current membership of any members' scheme |
| `membership.supporter` | none | No | A current membership of any supporters' scheme |
| `membership.scheme-holder` | `membership.scheme` | No | A current membership of that scheme |
| `membership.voter` | none | No | A current membership of a voting scheme, activated at least the qualifying period ago |

No ability is mapped to any of these by a preset. A theatre maps its own: for example a space-booking ability to `membership.holder`, so every member may book a rehearsal room.

## Presets

|  | Student society | Amateur company | Small venue |
| --- | --- | --- | --- |
| `membership` on | Yes | Yes | No |
| `membership-fees` on | No | Yes | No |
| Starting scheme, created as a draft | "Member": members' side, rolling, with lengths of 12 and 36 months, a reference list accepted at the checkout, holders may not end it themselves, verifier `list`, free | "Member": members' side, rolling 12 months, no verifier, requires payment | none |
| `membership.renewal.grace` | 0d | 30d | 0d |
| `membership.join.public-listing` | true | true | true |

The student society preset is built on Nottingham New Theatre, whose membership is sold by its students' union for 12 or 36 months from purchase and checked by the committee against the union's records. Its starting scheme is on the members' side, rolling, with two length options (12 and 36 months), verified by a reference list whose label the theatre writes, with `accepts_reference` on and `holder_may_end` off; `membership.ending.by-holder` is off. The fees module stays off, because the union takes the money. A society whose union resets every membership on one date changes the scheme to a fixed end date (31 August, say) with one option.

Role mappings in the presets are the Suggested holders columns above, by the preset role keys Identity defines: `administrator`, `membership-officer`, `committee-member`, `finance-officer`, `box-office-manager`, `box-office-staff`. The small-venue preset does not create `membership-officer`; if such a venue switches Membership on, its abilities fall to `administrator` until the theatre adds a role.

## Rate limits

| Route | Class |
| --- | --- |
| The public list of schemes | `default` |
| Applying, renewing, withdrawing, paying | `write`, and idempotent |
| Uploading a verification list, building an export | `export` |
| A requirement check that carries a typed reference | presented-value, applied by the kit before Membership is called (core.rate-limits.presented-value). Membership adds no limit of its own |

## Translation keys

Labels and help for every setting and ability are derived from the names, as Foundations requires. Reason keys returned by verifiers and by the requirement provider live under `membership.reasons.*`, so the same wording serves the join page, the staff queue and Box office's checkout.
