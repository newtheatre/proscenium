# 6. Settings and abilities

Identity registers 37 settings and 20 abilities, written here in the column layouts of the foundations draft. It also owns the list of preset roles that every other workstream maps its abilities to.

## Settings

Every setting is changed by `core.identity-settings.manage` unless the row says otherwise. Audience is staff unless stated.

**Where each setting is shown.** Placement is declared once per group, through `settingGroups` and `settingPages` in the manifest, and every setting has exactly one home (Matt's ruling of 16 November 2026 on settings). No setting carries a scope of its own.

| Groups | Home |
| --- | --- |
| `sign-in`, `sessions`, `recovery` | Admin, Access: Sign-in, `/admin/sign-in` |
| `privacy` | Admin, Access: Privacy, `/admin/privacy` |
| `grants`, `members-area`, `access-scheme`, `emergency-contacts`, `merge` | The console, People: People settings |
| `retention`, except `core.retention.armed` | Admin, Upkeep: Advanced, `/admin/advanced` |
| `core.retention.armed` | Identity's own Retention screen, `/admin/retention`, and nowhere else |

Most settings save with no prompt, in Admin as in the console. A few are declared `onChange: 'confirm'`, because a slip locks people out or weakens sign-in: `core.sign-in.email-link`, `core.sign-in.google`, `core.sign-in.google-domains`, `core.sign-in.managed-domains`, `core.sign-in.provider-is-strong` and `core.grants.allow-no-expiry`. `core.retention.armed` is declared `onChange: 'reason'`. Saving one of these shows what will change, asks again, and asks the person to confirm it is them in place only if the session is not fresh (`core.access.fresh-within`). The history of every setting, with Revert, is foundations' screen at `/admin/settings-history`. A duration is entered through the kit's `DurationInput`, where a month is 30 days and a year 365; what is stored does not change.

Every setting whose value is a retention period is also `onChange: 'confirm'`, by the platform's rule, because shortening one lets the next sweep delete rows for good. In identity those are `core.retention.unclaimed-after`, `core.retention.dormant-after`, `core.emergency-contacts.keep-after-standing`, `core.access-scheme.keep-rejected`, `core.merge.undo-window` and `core.privacy.export-lifetime`. `core.retention.run-cap` is a count, not a period, and saves with no prompt.

A setting may name a screen of its own only once that screen shows and saves it, so that nothing is reachable through the API alone. The Retention screen is a later release (part 5). Until it is built, `core.retention.armed` sits on `/admin/advanced` with the rest of the retention group, still `onChange: 'reason'` and still changed only by `core.retention.arm`. It moves to `/admin/retention` in the release that ships the screen, and leaves the Advanced page then. In the declaration every setting names its own ability; there is no ability for a whole group. Page ids take the form `core.sign-in`, `core.privacy` and `core.people`.

### Signing in

| Key | Kind | Default | Limits | Audience | Quotable | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| `core.sign-in.email-link` | boolean | true |  | public | No | Whether a link and code can be emailed. Passkeys cannot be switched off. |
| `core.sign-in.link-lifetime` | duration | 15m | 5m to 1h | public | Yes | How long an emailed link and code work |
| `core.sign-in.code-attempts` | integer (attempts) | 5 | 3 to 10 | staff | No | Wrong codes allowed before the link must be requested again |
| `core.sign-in.open-sign-up` | boolean | true |  | public | No | Whether a person nobody invited may create an account. Guest checkout is unaffected. |
| `core.sign-in.google` | boolean | false |  | public | No | Whether Google sign-in is offered |
| `core.sign-in.google-domains` | list of text | empty |  | staff | No | Google organisation domains accepted. Empty accepts any Google account. |
| `core.sign-in.managed-domains` | list of text | empty |  | public | No | Email domains whose addresses sign in only through the provider, never by emailed link |
| `core.sign-in.provider-is-strong` | boolean | false |  | staff | No | Treat a managed-domain provider sign-in as strong assurance. For a theatre whose provider enforces two-step sign-in. |
| `core.sign-in.invite-lifetime` | duration | 7d | 1d to 30d | staff | No | How long an invitation link works |
| `core.sign-in.unverified-address-lifetime` | duration | 7d | 1d to 30d | staff | No | How long an added address may stay unverified before it is removed |

### Sessions and recovery

| Key | Kind | Default | Limits | Audience | Quotable | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| `core.sessions.lifetime` | duration | 30d | 1d to 90d | public | Yes | The longest a browser stays signed in |
| `core.sessions.idle-limit` | duration | 14d | 1h to 90d | staff | No | How long an unused session lasts |
| `core.recovery.code-count` | integer (codes) | 10 | 6 to 20 | staff | No | Recovery codes in a set |
| `core.recovery.enrolment-link-lifetime` | duration | 24h | 1h to 7d | staff | No | How long a staff-issued passkey enrolment link works |

### Roles and the members' area

| Key | Kind | Default | Limits | Audience | Quotable | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| `core.grants.default-expiry` | choice: year-end, none | none |  | staff | No | What a new role's expiry rule starts as |
| `core.grants.allow-no-expiry` | boolean | true |  | staff | No | Whether a grant may be made with no end date |
| `core.grants.expiry-warning` | duration | 14d | 1d to 60d | staff | No | How far ahead a holder is warned that a role will lapse |
| `core.members-area.enabled` | boolean | true |  | public | No | Whether the members' area exists at all |
| `core.members-area.name` | text | Members' area | 40 characters | public | Yes | What the theatre calls it: "Company area", "Volunteers" |

### Merge, privacy and retention

| Key | Kind | Default | Limits | Audience | Quotable | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| `core.merge.undo-window` | duration | 30d | 0d to 90d | staff | No | How long a merge can be undone |
| `core.privacy.cooling-off` | duration | 7d | 0d to 30d | public | Yes | The wait between confirming an erasure and it running |
| `core.privacy.respond-within` | duration | 30d | 1d to 90d | public | Yes | The date by which a data request should be answered. A theatre sets this to what its own law requires. |
| `core.privacy.export-lifetime` | duration | 7d | 1d to 30d | public | Yes | How long a prepared download is kept |
| `core.privacy.contact` | text | unset | 120 characters | public | Yes | Who to contact about personal data. Erasure and export are blocked from public view until it is set. |
| `core.retention.unclaimed-after` | duration | 1095d | 90d to 3650d | public | Yes | When an untouched unclaimed account is anonymised |
| `core.retention.dormant-after` | duration | 730d | 180d to 3650d | public | Yes | When an unused claimed account is anonymised, after warnings |
| `core.retention.run-cap` | integer (accounts) | 50 | 1 to 500 | staff | No | The most accounts one sweep run may anonymise |
| `core.retention.armed` | boolean | false |  | staff | No | Whether the sweeps act or only report. Changed by `core.retention.arm`. |

### Emergency contacts and the access scheme

| Setting | Kind | Default | Limits | Audience | Quotable | Purpose |
| --- | --- | --- | --- | --- | --- | --- |
| `core.emergency-contacts.keep-after-standing` | duration | 30d | 0d to 365d | staff | Yes | How long emergency contacts are kept after a person's last standing ends |
| `core.access-scheme.enabled` | boolean | true |  | public | No | Whether the theatre runs an access scheme people can apply to |
| `core.access-scheme.name` | text | Access scheme | 1 to 40 characters | public | Yes | What the theatre calls its scheme |
| `core.access-scheme.allow-note` | boolean | true |  | staff | No | Whether a person may add a short note beside each need |
| `core.access-scheme.companions-need-verified` | boolean | false |  | staff | Yes | Whether companion tickets wait until a reviewer has seen evidence |
| `core.access-scheme.reply-within` | duration | 14d | 1d to 90d | public | Yes | How long an application may wait before it is flagged |
| `core.access-scheme.review-after` | duration | 1095d | 365d to 3650d | staff | Yes | How long after acceptance a person is asked to confirm their details |
| `core.access-scheme.keep-rejected` | duration | 90d | 0d to 365d | staff | Yes | How long a rejected application is kept before it is deleted |

### Rules across settings

| Rule | Check |
| --- | --- |
| A way in always exists | Passkey is fixed on; turning off the email link is refused while any claimed account has no passkey and no provider link |
| Idle within lifetime | `sessions.idle-limit` is no longer than `sessions.lifetime` |
| Managed domains need a provider | `sign-in.managed-domains` is empty unless `sign-in.google` is on |
| Strong provider needs a managed domain | `sign-in.provider-is-strong` is false unless `sign-in.managed-domains` is set |
| No expiry needs permission | A role's expiry rule cannot be "none" while `grants.allow-no-expiry` is false, except Owner |

### What the presets change

| Setting | Student society | Amateur company | Small venue |
| --- | --- | --- | --- |
| `core.grants.default-expiry` | year-end | none | none |
| `core.members-area.enabled` | true | true | false |
| `core.members-area.name` | Members' area | Members' area | Staff area |

NNT's own rules are three values on top of the student-society preset: Google on, `newtheatre.org.uk` as the accepted and managed domain, and roles that need a managed identity.

### Rate limits

Identity's routes need one limit class beyond ordinary reads and writes. The foundations thread owns how classes are declared.

| Class | Applies to | Proposed limit |
| --- | --- | --- |
| `sign-in` | Requesting a link, trying a code, starting a passkey or provider sign-in, using a recovery code | Counted per address and per network address, with core's bot challenge declared on the routes that send email |

## Record types

| Record type | Table | Parent | Owner column |
| --- | --- | --- | --- |
| `core.account` | `core_accounts` | none | `id` (a person owns their own account) |
| `core.role` | `core_roles` | none | none |
| `core.grant` | `core_grants` | none | `account_id` |
| `core.data-request` | `core_data_requests` | none | `account_id` |

## Abilities

A privileged ability needs a strong session. One that changes something also needs a fresh check, which is the foundations default for `risk: 'privileged'`. One that only reads declares `fresh: false` and `audit: 'read'`: strong, audited as a read, never asked again. The second table below gives the three entry fields for every ability.

| Ability | Acts on | Risk | Owner | Implies | Purpose | Suggested holders |
| --- | --- | --- | --- | --- | --- | --- |
| `core.account.search` |  | normal |  |  | Find a person in the picker; shows id and name only | Every preset role with console work |
| `core.account.read` | `core.account` | privileged | grants | `account.search` | See a person's details, addresses and how they sign in. Not their orders, records or contacts. | Administrator, Membership officer |
| `core.account.create` |  | privileged |  | `account.search` | Add someone by name and address | Administrator, Membership officer |
| `core.account.update` | `core.account` | privileged | grants | `account.read` | Change a person's details and addresses on their behalf | Administrator |
| `core.account.disable` | `core.account` | privileged | refuses | `account.read` | Disable and enable an account | Administrator |
| `core.account.merge` | `core.account` | privileged | refuses | `account.read` | Merge two accounts and undo a merge | Administrator |
| `core.account.recover` | `core.account` | privileged | refuses | `account.read` | Issue a passkey enrolment link to somebody locked out | Administrator |
| `core.session.end` | `core.account` | privileged | grants |  | End a person's sessions | Administrator |
| `core.emergency-contact.read` | `core.account` | privileged | grants |  | Read a member's emergency contacts, one person at a time, with a reason. Every read is audited and shown to the person. | Welfare lead. By fact, only once the theatre maps it: the duty manager on tonight's confirmed shift. Not Owner or Administrator. |
| `core.access-profile.read` | `core.account` | privileged | grants |  | Read a person's access needs for the purpose `core.welfare`, and for any purpose that names no ability of its own, when the person has switched that purpose on. Every read is audited and shown to the person. | Welfare lead. Box office reads under its own ability named by the purpose `box-office.booking`, not this one. |
| `core.role.read` |  | normal |  |  | See roles, facts and what each holds | Administrator, Committee member |
| `core.role.manage` |  | privileged |  | `role.read` | Create and edit roles; map abilities to facts | Administrator |
| `core.grant.read` |  | normal |  | `account.search` | See who holds what | Administrator, Committee member, Membership officer |
| `core.grant.manage` |  | privileged | refuses | `grant.read` | Grant, renew and end roles, at the scope held or narrower | Administrator; Production lead on their own production |
| `core.data-request.manage` | `core.data-request` | privileged | refuses | `account.read` | Start, review and cancel exports and erasures for other people | Administrator |
| `core.identity-settings.manage` |  | privileged |  |  | Change the settings above | Administrator |
| `core.retention.arm` |  | privileged |  |  | Arm or disarm the account sweeps | Owner only |

| Ability | `assurance` | `fresh` | `grantAt` |
| --- | --- | --- | --- |
| `core.account.search` | any | false | site |
| `core.account.read` | strong | false, with `audit: 'read'` | site |
| `core.account.create` | strong | default | site |
| `core.account.update` | strong | default | site |
| `core.account.disable` | strong | default | site |
| `core.account.merge` | strong | default | site |
| `core.account.recover` | strong | default | site |
| `core.session.end` | strong | default | site |
| `core.emergency-contact.read` | strong | false, with `audit: 'read'` | site, and by fact |
| `core.access-profile.read` | strong | false, with `audit: 'read'` | site, and by fact |
| `core.role.read` | any | false | site |
| `core.role.manage` | strong | default | site |
| `core.grant.read` | any | false | site |
| `core.grant.manage` | strong | default | site, module, record |
| `core.data-request.manage` | strong | default | site |
| `core.identity-settings.manage` | strong | default | site |
| `core.retention.arm` | strong | default | site |

"Default" is the freshness window `core.access.fresh-within`. A person using an ability over their own account through `owner: 'grants'` meets the same assurance and freshness as staff would.

Two more abilities run the access scheme, which makes nineteen.

| Ability | Acts on | Risk | Owner | Implies | Purpose | Suggested holders | `assurance` | `fresh` | `grantAt` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `core.access-scheme.read` | `core.account` | privileged | refuses | `account.search` | See the queue and open an application to the access scheme. Every opening is audited. | Box-office manager, Front-of-house manager, Welfare lead. Not Owner or Administrator by default. | strong | false, with `audit: 'read'` | site |
| `core.access-scheme.review` | `core.account` | privileged | refuses | `access-scheme.read` | Accept, reject, ask for more, verify; invite a person to apply or apply for them | The same three | strong | default | site |

One more, which makes twenty: `core.account.find`. It lets its holder narrow a list they can already see by a person's name or verified email, through `findAccounts` (part 4). It opens no account and shows no personal detail by itself. Entry fields: `risk: 'standard'`, `assurance: 'basic'`, `fresh: false`, `audit: 'read'`, owner identity. `core.account.search`, the picker's ability, implies it, since somebody who may look a person up by name may filter by one; so every preset role with console work holds it, and so do holders of `core.account.read`. Beyond that no preset role is given it directly: a module whose list needs the search has its own list ability imply it (box office's `box-office.order.view`, for one, which stewards hold by fact on a show night), so whoever may work that list may search it by name and nobody else can.

`core.account.find` is declared `impliable: true`, which is what lets another module's ability imply it under the foundations rule: the implied ability is of standard risk and its owner is core or a module the implying module requires. It is identity's only impliable ability. The audit entry for a call records the grant of the implying ability as what allowed it.

- **"Owner" in the Owner column means the person whose account it is.** `grants` gives everyone these abilities over their own account with no role; `refuses` stops staff disabling, merging or recovering their own.
- **`core.grant.manage` at a record scope is delegation.** A producer who holds it on one production can add their team to that production and nowhere else. They can give only roles whose abilities they hold there.
- **Four further limits apply whatever is held:** nobody grants themselves a role; nobody gives what they do not have; an Owner's grant is changed only by another Owner; no change may leave the theatre without a usable Owner.
- That makes 17 rows in this table, with the access scheme's two abilities below; `core.retention.arm` is deliberately held by no preset role.

## Facts

Identity declares one fact. The route declarations `public` and `signed-in` and the `owner` field cover what further facts would have.

| Fact | On | Standing | True when |
| --- | --- | --- | --- |
| `core.member` | none (site-wide) | It is the sum of them | The account holds at least one standing now, whether or not the members' area is switched on (the area shows when this fact is true and the area is enabled): a live grant of a role marked as opening the members' area, or any fact a module marks `standing: true` (a current membership, a place on a production, a confirmed shift) |

- **It is the single answer to "is this person a member now".** The interface reads it through `describeViewer`, and a module may map abilities to it like any fact.
- **With no Membership module switched on** it still works: roles and other modules' standings open the area, and the `volunteer` preset role exists to give somebody a standing by hand.
- **It is derived on each request and stored nowhere**, so it cannot fall out of step with what it sums.

It asks one thing of every fact other modules declare: whether it is a **standing**. A standing opens the members' area while it holds.

## Preset roles

A preset creates these roles as ordinary rows. A theatre renames, edits, archives or adds to them freely; modules refer to them only from a preset, by key.

| Key | Student society | Amateur company | Small venue | For | Opens members' area | Usual scope |
| --- | --- | --- | --- | --- | --- | --- |
| `owner` | Owner | Owner | Owner | Everything, including owners and recovery. Fixed. | Yes | Site |
| `administrator` | Administrator | Administrator | Administrator | People, roles, settings, data requests | Yes | Site |
| `committee-member` | Committee | Committee | Board | Oversight: read-only views across modules | Yes | Site |
| `box-office-manager` | Box Office Manager | Box office manager | Box office manager | Pricing, on-sale, refunds, reports | Yes | Site |
| `box-office-staff` | Box office | Box office | Box office | Selling and looking up orders | Yes | Site |
| `front-of-house-manager` | Front of House Manager | House manager | House manager | Rota, duty managers, incidents follow-up | Yes | Site |
| `bar-manager` | Bar Manager | Bar manager | Bar manager | Products, stock, till set-up | Yes | Site |
| `technical-manager` | Technical Manager | Technical manager | Technical manager | Spaces, kit, safety and training catalogue | Yes | Site |
| `finance-officer` | Treasurer | Treasurer | Finance manager | Ledger, budgets, period close | Yes | Site |
| `membership-officer` | Secretary | Membership secretary | not created | Members, verification, adding people | Yes | Site |
| `communications-officer` | Publicity Officer | Publicity officer | Marketing manager | Mailing lists and audience messages | Yes | Site |
| `production-lead` | Producer | Director | Producer | Running one production, including its team | Yes | One production |
| `visiting-company` | Visiting company | Visiting company | Visiting company | A hirer's view of their own production and its sales | No | One production |
| `volunteer` | Volunteer | Volunteer | Casual staff | No abilities; a standing for a theatre without the Membership module | Yes | Site |

- **Work done on the night is not a role.** A duty manager, a bar shift and an usher get their authority from the shift fact, so nobody has to remember to take it away.
- **A visiting company's role does not open the members' area.** Its holders see the console screens for their production and nothing of the theatre's own members' side.
- **Expiry.** In the student-society preset every role except Owner starts with expiry at the year end. Owner never expires; a yearly reminder asks the Owners to review who they are.
- **Identity's abilities for each role** are the Suggested holders column above. Every other workstream adds its own abilities to these keys in its manifest's presets.

### A fifteenth preset role

Added after the form builder and front of house specifications both needed a holder for welfare and access information.

| Key | Student society | Amateur company | Small venue | For | Opens members' area | Usual scope |
| --- | --- | --- | --- | --- | --- | --- |
| `welfare-lead` | Welfare Officer | Safeguarding lead | Safeguarding lead | Reading access needs, emergency contacts, and answers a form marks as welfare or access information; following up incidents about people | Yes | Site |

From identity it holds `core.access-profile.read` and `core.emergency-contact.read`, and nothing else. It is deliberately separate from `administrator`: an administrator manages accounts without reading this information, and the welfare lead reads it without managing accounts.

## Changes agreed during the phase 1 build

These prevail over the tables above where they differ.

| Matter | Ruling |
| --- | --- |
| Freshness window | How long a fresh proof of identity covers further sensitive actions is the kit's setting `core.access.fresh-within` (10 minutes by default, 1 minute to 1 hour). Identity declares no setting of its own for it. |
| Google client id | A new setting, `core.sign-in.google-client-id` (text, unset, staff audience). `core.sign-in.google` cannot be turned on while it or the client secret is unset. |
| Year-end expiry | The year-end rule reads `core.organisation.year-end`, which core domain declares: text in the form `MM-DD`, month then day (for example `07-31`), never 29 February, and unset until setup. A grant that expires at the year end ends at the close of the next occurrence of that day in the theatre's time zone (`core.locale.time-zone`). While the setting is unset, "year end" cannot be chosen as an expiry and a grant asks for an explicit end date instead. |
| Reads of an account | `core.account.read` needs a strong session but no fresh check (`fresh: false`). Foundations has ruled this for every privileged ability that only reads: strong, audited as a read, never asked again. The build follows it. |
| Module-scoped grants | A grant is one row naming a role and a scope. A module scope limits the role to that module's abilities when the resolver reads it; the abilities are never copied into the grant, so a later change to the role takes effect at once. |
| Pronouns | `core_accounts.pronouns`: optional free text of at most 40 characters, class Personal, cleared on erasure. Shown beside the name in the members' area and the console, and in the person's own account. Never on the public site, in audience emails, or in search results. |
