# 6. Settings and abilities

Identity registers 29 settings and 16 abilities, written here in the column layouts of the foundations draft. It also owns the list of preset roles that every other workstream maps its abilities to.

## Settings

Every setting is changed by `core.identity-settings.manage` unless the row says otherwise. Audience is staff unless stated.

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
| `core.sessions.reassert-window` | duration | 10m | 1m to 1h | staff | No | How long a fresh proof of identity covers further sensitive actions |
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

A privileged ability needs a strong session. A privileged ability used to change something also needs a fresh re-assertion.

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
| `core.emergency-contact.read` | `core.account` | privileged | grants |  | Read a person's emergency contacts. Every read is audited. | Fact: the duty manager's shift tonight |
| `core.access-profile.read` | `core.account` | privileged | grants |  | Read the access needs a person agreed to share. Every read is audited. | Box-office manager; fact: the duty manager's shift tonight |
| `core.role.read` |  | normal |  |  | See roles, facts and what each holds | Administrator, Committee member |
| `core.role.manage` |  | privileged |  | `role.read` | Create and edit roles; map abilities to facts | Administrator |
| `core.grant.read` |  | normal |  | `account.search` | See who holds what | Administrator, Committee member, Membership officer |
| `core.grant.manage` |  | privileged | refuses | `grant.read` | Grant, renew and end roles, at the scope held or narrower | Administrator; Production lead on their own production |
| `core.data-request.manage` | `core.data-request` | privileged | refuses | `account.read` | Start, review and cancel exports and erasures for other people | Administrator |
| `core.identity-settings.manage` |  | privileged |  |  | Change the settings above | Administrator |
| `core.retention.arm` |  | privileged |  |  | Arm or disarm the account sweeps | Owner only |

- **"Owner" in the Owner column means the person whose account it is.** `grants` gives everyone these abilities over their own account with no role; `refuses` stops staff disabling, merging or recovering their own.
- **`core.grant.manage` at a record scope is delegation.** A producer who holds it on one production can add their team to that production and nowhere else. They can give only roles whose abilities they hold there.
- **Four further limits apply whatever is held:** nobody grants themselves a role; nobody gives what they do not have; an Owner's grant is changed only by another Owner; no change may leave the theatre without a usable Owner.
- That makes 17 rows; `core.retention.arm` is deliberately held by no preset role.

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
