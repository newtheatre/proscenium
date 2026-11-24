# 4. Interface to other modules

Other modules meet identity in four ways, the four that the foundations draft allows: they call its services, hear its events, plug into its points, and declare facts it reads. No module reads an identity table, and identity names no module.

Identity is an area inside the always-on `core` module, as the foundations thread has confirmed, so every name below starts `core.`.

## Services

Each is a named export other modules import. A service that writes adds its statements to the caller's unit of work and never commits.

| Service | Takes | Gives back | Writes |
| --- | --- | --- | --- |
| `currentActor` | The request | The actor: account id, session id, assurance, when last re-asserted, and whether acting on somebody's behalf. Empty for a signed-out visitor. | No |
| `can` | Actor, ability, optional record | Yes, no, or not yet, with the reason and what would allow it | No |
| `authorise` | Actor, ability, optional record | Nothing if allowed; otherwise stops the request with the refusal. Adds the override audit entry when a fact marked as an override was relied on. | Audit only |
| `notSelf` | Actor, the account whose record it is | Stops the request when they are the same person | No |
| `describeViewer` | Actor | What the interface needs: name, the sides open to them, and the navigation entries they may see | No |
| `findOrCreateAccount` | An address, a name, an origin | The account id, and whether it was created. Never creates a second account for an address. | Yes |
| `canonicalAccount` | An account id | The id reads should use: the survivor, if the account was merged away | No |
| `accountLabel` | An account id | A name safe to show: the person's name, or "Former account" for a tombstone | No |
| `searchAccounts` | A query, the caller's ability | Up to 20 matches as id and name only | No |
| `addressFor` | An account id, a side | The verified address that side should write to, or nothing | No |
| `standingOf` | An account id | The list of standings currently held, each naming its source | No |
| `grantRole` | Account or address, role, scope, expiry | The grant id | Yes |
| `endGrant` | Grant id, reason | Nothing | Yes |
| `holdersOf` | Ability, optional record | The accounts that currently hold it by any route, for notifications such as "tell whoever can approve this" | No |
| `emergencyContactsOf` | Actor, account id, reason code | The contacts, only while the account has a standing, after checking the ability and writing an audit entry for the read | Audit only |
| `accessNeedsFor` | Actor, account id, purpose, optional record | The needs that purpose uses, only if the person switched the purpose on and the actor holds the purpose's ability; otherwise nothing. Audited as a read. | Audit only |

- `can` and `authorise` are the only way any module checks permission. The route declaration names an ability; the guard calls `authorise` with it.
- `findOrCreateAccount` is what guest checkout, the desk, a sign-off by address and an invitation all use. Its caller decides what to send the person.
- `searchAccounts` is the person picker. It returns unclaimed accounts too, so a guest can be chosen as the holder of a booking.

### Three services the core domain asked for

| Need | Service | Detail |
| --- | --- | --- |
| The address to write to, per side | `addressFor(accountId, side)` | `side` is `audience` or `members`. Returns the verified address the person chose for that side; the members' side falls back to the audience address; an unclaimed account returns the address it was created with. Returns nothing for a disabled account, an alias or a tombstone. |
| Everyone who holds an ability on a record | `holdersOf(ability, record?)` | Resolves across granted roles (at the record's scope and every scope above it), facts mapped to the ability, and ownership where the ability's owner rule grants. Returns canonical account ids, each once, excluding disabled accounts and pending grants. This is what `notifyHolders` calls. |
| Merge without per-module code | `mergeAccounts(survivorId, otherId)` | Settles the merge at once (stage one) and queues the job that moves or leaves every other module's rows from the column declarations alone (stage two, part 3). It returns when stage one has committed. A module writes merge code only where it declared `handler`. |

`notSelf` remains for a check inside a service; on a route the ability's `owner: 'refuses'` does the same job by declaration.

## Under 18: ageStatus

`ageStatus(accountId, on?)` and `ageStatuses(accountIds, on?)`, from the core's services alias, answer `'under-18'` when a recorded day the person turns 18 is still to come on that date (the theatre's today by default), and `'unknown'` otherwise (C-74, ruling R3-25). Unknown is never adult: the Bar keeps its Challenge 25 check for everyone it does not know is under 18. Modules never read the date. Only people who act on it see the marker: never public pages, member directories or exports. The setting `core.under-18.latest-finish` (a time, unset by default, on People's settings) is the one time Rehearsals and Productions warn against.

## Access needs: the purpose point

A module that wants to read access needs declares a purpose through the point `core.access-purpose`. The core knows no module's purpose in advance, so a new module joins without a change to the core.

| Field | Meaning |
| --- | --- |
| `id` | `<module>.<name>`, for example `box-office.booking` |
| `side` | `audience` or `members`. A members' purpose is offered only to a person with a standing. |
| `label` and `explanation` | Translated. The explanation is the sentence the person reads beside the switch: who will see the needs, when, and why. |
| `ability` | The ability the reader must hold. It must be privileged and declare `fresh: false` and `audit: 'read'`. Defaults to `core.access-profile.read`. |
| `uses` | The `core.access-need` entries this purpose receives, or all of them. |
| `note` | Whether it also receives the note beside each entry it uses. Default false. |
| `on` | Optional record type the read is about (a performance, a production, a course), passed as `record` and checked against the ability's scope. |

Purposes in the first release, each declared by its own module and agreed with it: `box-office.booking` (audience: the box office and the house team for a performance the person has booked; applying to the scheme agrees to it), and `core.welfare` (members: the theatre's welfare lead; off until the person switches it on), which identity declares. Production teams do not read access needs in the first release (Matt, 16 November 2026). `front-of-house.shift` is reserved for a later volunteer-shift purpose.

A read answers only for an accepted application. Two things are offered for booking without a staff read. The fact `core.access-scheme` is true while a person's application is accepted, and the value `core.access-scheme.companions` is the number of companions accepted (nought while `core.access-scheme.companions-need-verified` is on and the application is not verified). Box office names them in a ticket type's requirements through `core.requirement`; at checkout they are evaluated for the person's own session, so nobody else learns the answer. The fact is not a standing, opens nothing on the members' side, and has no `holders` enumerator, so nobody can list who is on the scheme through it.

The references a module stores are `fact:core.access-scheme` for the fact and `core.access-scheme.companions` for the value, which identity registers as a requirement source through `core.requirement`. Following Foundations' format, the source answers met with a `quantity` of 1 or 2, and not met when the number is nought, so box office can cap companion tickets at that number inside its own claim. The quantity may be copied onto what was sold and used in a condition on a statement; it never goes in a summary, an event or a job. When staff book for somebody else, the check is asked for the customer's account explicitly. The source names `box-office.order.view-access-note` as its `checkAbility` (the ability of the purpose `box-office.booking`, declared with `audit: 'read'`): a check about another account reaches the source only if the actor holds it, and the read is recorded against the account asked about. Without it the answer is not met with a reason, and the seller uses box office's override with a reason. A job, having no actor, never gets an answer about anybody.

The public page `/access` is a seeded content page that core domain lists (`site/content/access.md` in the starter, flagged as a placeholder until the theatre edits it). Identity contributes one component to it through `core.public-component`: `CoreAccessApplication`, with the alias `access-application`, so the page writes `::access-application`. It shows the viewer their way into the application: "Apply" when signed out or not yet applied, the state of their application when they have one, and nothing when `core.access-scheme.enabled` is off. The page may quote `core.access-scheme.reply-within` and `core.access-scheme.name` live. Applying from My account does not depend on the page: with the page deleted or the public site switched off, the button in My account and the form still work.

One more service, `accessPurposesFor(accountId)`, lists the purposes a person can be offered now, for the My account screen. There is deliberately no service that says whether a person has recorded needs: that is itself sensitive, so a module learns it only by a successful read.

## Finding rows by a person's name or email

A module's list may not search the accounts table, yet a desk must find an order by its buyer. Identity offers `findAccounts(text, list)`, exported from core's services. It answers an SQL subquery of account ids, never a list of ids, which the calling module passes to the kit's `inAccountScope` in its own list's condition. The lookup is therefore one statement, follows merges, and shows the caller nothing but rows of its own list that its own ability already allows.

It only ever narrows a list the caller may already see. It grants sight of nothing: finding an unclaimed or a disabled account means only that the rows of the caller's own list which belong to it are kept in the result. `list` must be a registered list id, and the service refuses one it does not know, so the audit entry is never free text.

That is the condition `core.account.find` rests on. Because the service shows and changes nothing by itself, the ability is declared on no record type and comes with the implying ability at any reach: a person who holds a module's list ability through a site-wide, module or record grant, or through a fact, holds `core.account.find` with it. If the service were ever made to return a name or a count, that would no longer be safe, and the ability would have to stop being impliable. Other modules' implications are written by full id, for example `box-office.order.view` implies `core.account.find`.

- **Guard.** The actor must hold `core.account.find` (part 6). Without it the service refuses; it does not answer an empty subquery, so a list cannot quietly find nothing.
- **What it searches.** The name, the preferred name, and verified email addresses in their normalised form. Nothing else: no phone, no unverified address, no special or encrypted column, no access or emergency detail.
- **Whom it finds.** Claimed and unclaimed accounts (a guest buyer is unclaimed) and disabled ones, since their orders still need finding. An account merged away is found as its survivor. A tombstone has no name or address left and is never found.
- **How it matches.** By the list search rules: at least three letters, case and accents folded, no ranking. It runs on a search index identity declares on its own table through the kit's search source.
- **Audit.** One entry per call, as a read, naming the caller and the list it was called for (`list` is the calling list's registered id). The text typed is never recorded, in audit, in logs or in an event.
- **Limits.** It is counted against the caller in the ordinary read class. It returns no count and no names, so it cannot be used to test whether somebody has an account.

This is a different thing from the person picker. `searchAccounts`, above, is for choosing a person who is not yet on the screen (adding somebody to a shift, opening a tab for somebody): it shows up to twenty names under `core.account.search`. `findAccounts` is for narrowing a list the module already shows, and shows no name of its own. A module uses the picker to choose and `findAccounts` to filter, and never queries the accounts table itself for either. Both read the same search index.

Identity declares the vocabulary `core.access-need` through core domain's point `core.vocabulary`, not locked, so a theatre can add, rename, reorder and retire entries on core's Vocabularies screen; a retired entry still shows on a profile that ticked it. The notes are identity's own data inside the special column. Access needs say what a person requires; the access features of a venue, a space or a performance say what the theatre offers and are core domain's. Neither list refers to the other, and matching them is for box office and front of house. Core domain declares no purpose in the first release, so a production team does not read access needs; the welfare lead is the route.

### People without a sign-in

Box office asked how erasure and download reach a guest buyer, a complimentary-ticket recipient or a waiting-list guest. The answer is that the account is the person, and a sign-in is something a person may or may not have. Every human a module records is a `core_accounts` row, made by `findOrCreateAccount`; an unclaimed account is exactly a person with no credentials. No module stores a name or address of its own for a person.

| Case | Rule |
| --- | --- |
| A guest gives an address no account has | A new unclaimed account. Signing in with that address later claims the same row, so history carries over with no merge. |
| A guest gives an address a claimed account has verified | The record attaches to that account: one address is one person. The typist gets no session and is shown nothing about the account; the owner gets the usual email, and My account marks the record "made without signing in". A module may refuse this for anything that is not a purchase by setting `attach: 'unclaimed-only'`. |
| A guest gives an address held unverified on some account | Unverified addresses match nothing. A new unclaimed account is made, and verifying later offers a join. |
| Somebody is named by another person (a complimentary ticket, a group booking) | An unclaimed account with origin `named-by-other`. Its first email says who holds their details and why, with the privacy contact. It receives service messages only. |
| A person with no address (a name on the door list) | An unclaimed account with no address. It can never be claimed; staff can add an address or merge it later. |
| Erasure or download for somebody who has never signed in | They sign in with the emailed link, which claims the account, and use the ordinary screens. There is no second path. |
| Retention | Only once the sweep is armed, an unclaimed account is anonymised when `core.retention.unclaimed-after` has passed since the later of its creation and the last order, record, grant or booking that references it. Accounts with origin `named-by-other` use the same rule. |

Every personal column in every module therefore still points at one id, and the walking erasure test covers guests with no extra code.

One case makes no person at all: an anonymous walk-up sale at the desk, where nobody's name or address is taken. It creates no account. The order's account column is empty and declares `subject: { account: 'account_id', unlinked: 'staff' }`, so the row holds no personal data and nothing is owed to anybody for it. This is the only valid order with no account, and every nullable account column in any module declares `unlinked` in the same way.

### Account or address: which a row uses

The foundations format also lets a table name its subject by an email column. A table may declare both columns, as the bar's tabs do, but each row is found one way: by its account if it names one, and by its email column only when it names no account. For an account, erasure and download sweep the rows that name it, plus rows with no account whose email column holds one of its verified addresses. A row that names a different account is never matched by address.

| A row that | Is keyed to | Examples |
| --- | --- | --- |
| Holds money, a ticket, a booking, or anything the person will want in My account | An account, unclaimed if need be | A guest order, a complimentary ticket for a named person, a door sale |
| Is only ever an address | The email column (`subject: { email }`) | A mailing-list sign-up, a waiting-list entry, a form sent in by somebody signed out |

**The one rule for claiming.** Nothing is linked until an address is proved, and proving an address is the only thing that links.

| When an address is verified on an account | What happens | Event |
| --- | --- | --- |
| The account was unclaimed with that address | It is now claimed. Nothing moves, because it is the same row. | `core.account.claimed` |
| A different, unclaimed account holds that address | It is merged into the verifying account by the ordinary merge, in the same batch. An unclaimed account has no credentials, so proof of the address is proof of ownership. | `core.account.merged` |
| Email-subject rows carry that address | Nothing moves. They are found by address whenever the account's data is listed, downloaded or erased. | `core.account-email.verified` |

Somebody with no account who wants their data or erasure signs in with the emailed link, which makes or claims an account for that address, and uses the ordinary screens; the sweep then covers their email-subject rows. Addresses are compared trimmed and lower-cased, as the foundations format stores them; identity alone also keeps the address as typed, for display.

### Rows no account or address can find

Some tables may hold a row about a person with no account linked, such as an incident naming a member of the public. The foundations format declares these `subject: { account: 'account_id', unlinked: 'staff' }`. Erasure and download cannot reach such a row automatically, so both flows treat it as a manual step.

| Where | What identity does |
| --- | --- |
| The data request screen in the console | Lists every enabled table declared `unlinked: 'staff'`, by module, as a checklist: "search these by hand for this person". Each line links to the owning module's search and names the redaction ability needed. |
| Finishing a request | An erasure or download started by staff cannot be marked complete until each line is ticked "searched, nothing found" or "found and handled", with who ticked it. A self-service request runs its automatic part at once and opens the same checklist for staff, still inside the respond-by date. |
| The person's own screens | The confirmation says plainly that records not linked to their account are checked by a person and may take until the respond-by date. |
| The download | Anything staff find is added by the owning module through `core.export-contributor`. |
| Retention | Unlinked rows are covered by their module's retention rule, not by identity's sweeps. |

Identity never reads or redacts these rows itself; the owning module does, under its own ability, and audits it.

### Mailing lists and audiences for messages

| Matter | Ruling |
| --- | --- |
| A signed-out mailing-list sign-up | An email-subject row in the communications module. It does not call `findOrCreateAccount` and makes no account. |
| A confirmed double opt-in | Not proof of address for an account claim. It proves somebody with the inbox agreed to receive mail; it does not show an intent to sign in, its link is long-lived and may be opened by a mail scanner or a forwarded reader, and a claim can merge records and open My account. Only identity's own single-use, short-lived link or code, or a provider's verified address, verifies an address. |
| A subscriber who later signs in | Their subscription is found by the verified address, like any email-subject row. Nothing moves. |
| "Holders of a role" as an audience for a message | Communications declares the audience sources itself (`communications.role-holders`, `communications.ability-holders`, `communications.members`), because the core never contributes to a module's point. Identity supplies the services they read: `holdersOfRole(roleId, scope?)` returns canonical account ids with a live grant, `holdersOf` returns the holders of an ability on a record, and the fact `core.member` says who is a member now. |

Those services return account ids only. One further service supports sending once to a person who is on a list twice: `verifiedAddressesOf(accountId)` returns every verified address of an account, normalised, for server-side matching only; it is never shown and never returned to a browser. A module that keeps email-subject rows shows them in My account through the Interface's `core.account-section`, where identity hands it the same list of verified addresses.

Listing who holds a fact needs more than the fact's yes-or-no answer. The foundations fact format grows an optional `holders(record?)` enumerator for this; `holdersOf` and the members list call it for each fact mapped to the ability, and a fact without one contributes nobody to a list (it still grants authority to the person asking).

### Checking an address without seeing it

Membership needs to know things about a person's addresses (a student domain, a place on a list) without holding the addresses. Two services answer without returning one.

| Service | Takes | Gives back |
| --- | --- | --- |
| `hasVerifiedAddressAt(accountId, domains)` | An account and a list of domains | Whether any verified address of the account is at one of them, and which domain matched. Never the address. Sub-domains match only if listed. |
| `verifiedAddressDigests(accountId, keyName)` | An account and the name of a key the calling module holds as a secret | A keyed digest (HMAC-SHA-256) of each verified, normalised address. The module stores its list as digests under the same key and compares. A plain hash is refused as a design, because addresses are guessable. |

Both count verified addresses only, are server-side only, and return nothing for a disabled account, an alias or a tombstone.

A module computes the matching digest of an address somebody typed with `addressDigest(address, keyName)`, which applies the same normalisation and the same key. A module that keeps a digest in place of an address (the bar's receipt address on a tab) has no email column for the sweep to find, so it contributes those rows itself: to the download through `core.export-contributor`, and to erasure through `core.erasure-handler`, each matching by digest against `verifiedAddressDigests`.

## Events announced

Payloads carry ids only. An event is written in the same batch as the change and delivered afterwards.

**Every event below is declared `internal: true`.** Outgoing webhooks are in the first release and carry any event not marked internal. No identity event (account, address, grant, role, merge, erasure or data request) may leave the system, so none is offered to a webhook.

| Event | When | Payload |
| --- | --- | --- |
| `core.account.created` | An account row is written | Account id, origin |
| `core.account.claimed` | The first sign-in | Account id |
| `core.account.disabled` | Staff disabled it | Account id |
| `core.account.enabled` | Staff enabled it | Account id |
| `core.account.merged` | A merge committed | Survivor id, merged-away account id, merge id |
| `core.account.unmerged` | A merge was undone | Survivor id, merged-away account id, merge id |
| `core.account.erased` | The erasure's last stage committed | Account id |
| `core.account-email.verified` | An address was proved | Account id, address id |
| `core.account-email.removed` | An address was removed | Account id, address id |
| `core.grant.created` | A grant was written | Grant id, account id, role id |
| `core.grant.ended` | A grant was ended early | Grant id, account id, role id |
| `core.grant.expiring` | The warning period before a lapse begins | Grant id, account id |
| `core.role.changed` | A role's abilities were edited | Role id |
| `core.data-request.finished` | An export or erasure finished | Request id, kind |

- A lapse writes nothing, so it announces nothing. `core.grant.expiring` comes from a daily task.
- `core.account.merged` is sent when stage one commits: the alias stands, but rows may not have moved yet. A listener that caches anything keyed to an account drops it then, and must not assume its rows already carry the survivor's id; it reads through the account scope like everybody else. `core.account.unmerged` is sent when an undo's last unit clears the alias.
- There is no event for a sign-in. The audit log records it and nothing else needs it.

## Events listened for

| Event | Why |
| --- | --- |
| `core.setting.changed` | To drop cached sign-in configuration when a sign-in setting changes |

Identity listens for nothing from a feature module. What it needs from them arrives through facts and points, read at the moment of a request.

## Points offered

| Point | Kind | A contribution is | Empty means |
| --- | --- | --- | --- |
| `core.sign-in-method` | code | A way of proving who somebody is: its id, whether it reaches strong assurance, how it starts and how it finishes. Identity contributes passkey, email link and Google itself. | Cannot be empty: passkey is always present |
| `core.erasure-hold` | code | Given an account, a list of hold codes or none. A hold code has a translated explanation for staff and one for the person. | Nothing holds an erasure |
| `core.merge-handler` | code | Given the survivor, the merged-away account and the merge id: the statements for rows a plain move would break, and a count for the preview. The statements run in a unit of their own in stage two, so they must fit one unit, be safe to run twice, and list what they change in the merge's items (the kit gives a helper) so an undo can reverse it | Every reference is a plain move or an alias |
| `core.export-contributor` | code | Given an account, extra material for the export that the data-class registry cannot find, such as files | The export holds registry rows only |

Identity also uses points other workstreams offer: `core.navigation` for its own screens, `core.erasure-handler` for anything a module must do beyond the registry, `core.record-resolver` to turn an account id into a label and a link, and `core.account-section`. That last point is the Interface workstream's to define (its fields are `id`, `target` of `account` or `console-person`, `side`, `ability`, `component`, `order`, and optionally `to`, `icon` and `count`). Identity is a contributor to it: its own sections of "My account" and of the console's person page are entries like any module's.

## Facts read

A fact is declared by the module that owns the records behind it. Identity does three things with every declared fact.

| Use | How |
| --- | --- |
| Authority | The theatre maps abilities to the fact, as it does to a role. The resolver asks the fact whether it holds for this actor and this record. |
| Standing | A fact marked as a standing opens the members' area while it holds. |
| Explanation | The "what can I do and why" screen names the fact in the person's own terms: "your shift tonight". |

Facts other workstreams are expected to declare, as examples and not as decisions: a current membership (Membership, a standing), a confirmed shift in its window (Front of house, a standing), a place on a production's team (core domain, a standing), a current training record (Training, not a standing by itself).

Identity declares one fact, core.member, which answers whether a person is a member now (part 6). Two others it once proposed are carried by the foundations formats instead, as below.

| Was | Now |
| --- | --- |
| A fact for "has a live session" | The route declaration `signed-in` |
| A fact for "this is my own account" | The ability field `owner: 'grants'` on the record type `core.account` |

That is how a person holds abilities over their own account without a grant: reading their own emergency contacts, ending their own sessions.

## Record types

| Record type | Grantable scope | Notes |
| --- | --- | --- |
| `core.account` | No | The target of account abilities and of audit entries |
| `core.role` | No |  |
| `core.grant` | No |  |
| `core.data-request` | No |  |

Identity has no record a grant can be scoped to. The record types that can scope a grant (a production, a venue, a space) belong to workstream 3 and to feature modules.

## Jobs and scheduled tasks

| Name | Kind | Does |
| --- | --- | --- |
| `core.send-sign-in-link` | Job | Hands the link and code to notifications, so a slow mail provider never slows the sign-in screen |
| `core.build-export` | Job | Gathers a person's data into one file |
| `core.run-erasure` | Job | Runs one stage of the erasure for a confirmed request whose cooling-off is over and which has no holds, then queues the next |
| `core.sweep-identity` | Task, hourly | Deletes spent tokens, challenges and long-ended sessions; closes merge undo windows; removes unverified addresses |
| `core.warn-grants` | Task, daily | Announces `core.grant.expiring`; lists pending grants nobody claimed |
| `core.review-data-requests` | Task, daily | Re-checks held erasures; warns staff of any request nearing its respond-by date |
| `core.sweep-accounts` | Task, daily | The unclaimed and dormant sweeps, in report-only mode until armed |

## Notification types

Identity contributes these types to `core.notification-type`. All are service messages: none can be switched off by the person, and none carries marketing.

| Type | Sent when | To |
| --- | --- | --- |
| `core.sign-in-link` | A link and code are requested | The address asked for |
| `core.address-verify` | An address is added or changed | The new address |
| `core.address-changed` | A side's address changes | The old address |
| `core.invitation` | A role is granted to an address with no account, or staff invite a person | The invited address |
| `core.credential-added` | A passkey or recovery codes are added, or a staff enrolment link is issued | Every verified address |
| `core.grant-expiring` | A grant nears its end | The holder and whoever can renew it |
| `core.export-ready` | A download of personal data is built | The person |
| `core.erasure-confirm` | Erasure is asked for, opening the cooling-off | The person |
| `core.erasure-done` | Erasure has run | The address as it was, once |
| `core.dormant-warning` | An account is due to be anonymised by the dormant sweep | The person |
| `core.named-by-other` | Somebody else gives a person's details (a complimentary ticket, a group booking) | The person named, on first use |
| `core.merge-notice` | Two accounts are merged | Every verified address of both |

Each is declared in core domain's type format. Kind is `transactional` for all of them, so none has a topic. Lane is `prompt`. Side is `audience` for every type except `core.grant-expiring`, which is `members`; a change to the members' address is announced by a second type, `core.members-address-changed`, on the `members` side, because a type has exactly one side. Channel is email for all; `core.grant-expiring`, `core.export-ready` and `core.merge-notice` also go to the inbox. `core.sign-in-link` and `core.address-verify` go to an address that may have no account yet, so they call `notifyAddress`; the rest call `notify`. Each ships a template whose variables are the theatre's name, the person's name where there is one, and the link, code or date the message is about.

Expiry warnings are sent once per sweep, not once per grant, because at a year end most grants lapse on the same day. The holder gets one `core.grant-expiring` message per sweep naming each of their roles that is about to end and its date, with a link to "What you can do". The people who can renew get one `core.grants-expiring` message per sweep that found something (members' side, transactional, prompt, email and inbox; its variables are a count and the earliest date), with a link to "Who holds what" filtered to grants about to lapse. They are the holders of `core.grant.manage` at the grant's scope who could themselves grant that role, leaving out the grant's own holder. Each grant is warned about once, recorded in `core_grant_warnings`; a renewal is a new grant and is warned about in its turn.

"Once per sweep" is held by the dedupe key, which names the sweep and nothing else: the type and the sweep's date in the theatre's time zone, for example `core.grant-expiring:2027-07-01`. The account is left out of the key, because core adds each recipient's account itself. A sweep run twice on one day therefore sends nothing twice.

The access scheme adds four, all transactional, prompt and audience side. Three go by email and to the inbox: `core.access-application-received` (to the person on applying, or when staff apply for them), `core.access-application-decided` (accepted, rejected, more asked, verified or the mark removed; the email names no need and links to My account) and `core.access-review-due` (asking the person to confirm their details). The fourth, `core.access-invitation`, carries the single-use link to the form and so goes by email only, by `notifyAddress`. A fifth, `core.access-application-waiting`, goes to the reviewers on the members' side when an application passes `core.access-scheme.reply-within`.

A link or code that lets somebody in is a secret, so it follows core domain's rule for a variable that carries a secret. The types `core.sign-in-link`, `core.address-verify`, `core.invitation` and `core.access-invitation`, and any type carrying a recovery or enrolment link, declare that variable with kind `sealed`. Such a type is email only. Core keeps the value encrypted, clears it once the email reaches a final state, and shows only the variable's name and "hidden" in the console, the delivery log, previews, audit, events and logs. A cleared message cannot be sent again; identity issues a new link instead. Core does not know a link's lifetime, so expiry stays identity's (the settings in part 6), and links are single-use wherever they can be. With sealed variables a link may go through `notify` to anybody who has an account, including an unclaimed one; `notifyAddress` remains only for a send before any account exists, and takes sealed variables the same way.

Identity's links follow the foundations rules for link tokens. A sign-in link, an invitation, an address check, a merge confirmation, an enrolment link and an invitation to apply each carry a random 32-byte token made by the kit's `linkTokens`; only its hash is stored, with an expiry, on the row it opens (`core_account_tokens`). The route declares the token parameter so it stays out of logs. The landing page sends no referrer, is never stored by the browser, and gives one answer for a wrong, a used and an expired link. The address in every message comes from the kit's `siteUrl(path)`, which reads `core.site.origin`. The passkey relying party is identity's own setting, used for passkeys only; no other module reads it and identity does not build links from it.

## Secrets

| Secret | Needed | For |
| --- | --- | --- |
| `CORE_SESSION_KEY` | Always | Deriving the hashes of tokens and the browser binding |
| `CORE_GOOGLE_CLIENT_SECRET` | When used | Google sign-in |
| `CORE_OWNER_RECOVERY` | Optional | Present only while an owner is being recovered |

Access profiles are a special column and use the platform's one key, `CORE_ENCRYPTION_KEY`, versioned so it can be rotated; identity has no key of its own for them. Bot protection is one core service with the secret `CORE_TURNSTILE_SECRET_KEY`, and the sign-in routes opt in through their route declaration. Foundations' secrets table is the single index of every core secret, including the three above.

## What each workstream must do to fit

| Workstream | Must |
| --- | --- |
| 3. Core domain | Declare the fact for a place on a production's team; mark production and venue as grantable record types; take a side when sending a notification |
| 4. Box office | Call `findOrCreateAccount` at checkout and at the desk; declare its account references as move or alias; contribute an erasure hold for unsettled money and unused tickets; contribute its "Tickets and orders" section to My account on the audience side; declare the access purpose box-office.booking, copy what it receives onto the order as its own special-category column, name core.access-scheme in the requirements of the ticket types that need it, and point buyers who are not on the scheme to the application |
| 5. Form builder | Later, with its story FB-505: bind form fields to identity's `forms.bindable` contributions (phone, preferred name, emergency contact). Custom fields on a person are later still (FB-511). In the first release the access-needs and emergency-contact questions are identity's own screens, written straight to `core_access_profiles` and `core_emergency_contacts`, not a form builder form. |
| 6. Interface | Draw the header from `describeViewer` and nothing else; never test for a role in a page |
| Later modules | Membership, Front of house and Training each declare their fact and say whether it is a standing |
