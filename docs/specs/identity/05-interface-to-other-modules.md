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
| `canonicalAccount` | An account id | The id reads should use: the winner, if the account was merged away | No |
| `accountLabel` | An account id | A name safe to show: the person's name, or "Former account" for a tombstone | No |
| `searchAccounts` | A query, the caller's ability | Up to 20 matches as id and name only | No |
| `addressFor` | An account id, a side | The verified address that side should write to, or nothing | No |
| `standingOf` | An account id | The list of standings currently held, each naming its source | No |
| `grantRole` | Account or address, role, scope, expiry | The grant id | Yes |
| `endGrant` | Grant id, reason | Nothing | Yes |
| `holdersOf` | Ability, optional record | The accounts that currently hold it by any route, for notifications such as "tell whoever can approve this" | No |
| `emergencyContactsOf` | Actor, account id | The contacts, after checking the ability and writing an audit entry for the read | Audit only |
| `accessProfileOf` | Actor, account id, purpose | The decrypted answers the person agreed to share for that purpose, after the same check and audit | Audit only |

- `can` and `authorise` are the only way any module checks permission. The route declaration names an ability; the guard calls `authorise` with it.
- `findOrCreateAccount` is what guest checkout, the desk, a sign-off by address and an invitation all use. Its caller decides what to send the person.
- `searchAccounts` is the person picker. It returns unclaimed accounts too, so a guest can be chosen as the holder of a booking.

### Three services the core domain asked for

| Need | Service | Detail |
| --- | --- | --- |
| The address to write to, per side | `addressFor(accountId, side)` | `side` is `audience` or `members`. Returns the verified address the person chose for that side; the members' side falls back to the audience address; an unclaimed account returns the address it was created with. Returns nothing for a disabled account, an alias or a tombstone. |
| Everyone who holds an ability on a record | `holdersOf(ability, record?)` | Resolves across granted roles (at the record's scope and every scope above it), facts mapped to the ability, and ownership where the ability's owner rule grants. Returns canonical account ids, each once, excluding disabled accounts and pending grants. This is what `notifyHolders` calls. |
| Merge without per-module code | `mergeAccounts(survivorId, otherId)` | Moves or aliases every other module's rows from the column declarations alone. A module writes merge code only where it declared `handler`. |

`notSelf` remains for a check inside a service; on a route the ability's `owner: 'refuses'` does the same job by declaration.

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
| Retention | An unclaimed account is anonymised `core.retention.unclaimed-after` after the last record that references it, and at the next sweep if nothing references it at all. Accounts with origin `named-by-other` use the same rule. |

Every personal column in every module therefore still points at one id, and the walking erasure test covers guests with no extra code.

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
| "Holders of a role" as an audience for a message | Identity contributes it. `holdersOfRole(roleId, scope?)` returns canonical account ids with a live grant, and identity contributes three sources to the communications audience point: holders of a role, holders of an ability on a record (`holdersOf`), and everyone for whom `core.member` is true. |

Identity's three contributions to `communications.audience-source` are keyed `core.role-holders`, `core.ability-holders` and `core.members`, and return account ids only. One further service supports sending once to a person who is on a list twice: `verifiedAddressesOf(accountId)` returns every verified address of an account, normalised, for server-side matching only; it is never shown and never returned to a browser. A module that keeps email-subject rows shows them in My account through `core.account-section`, where identity hands it the same list of verified addresses.

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
| `core.account.merged` | A merge committed | Winner id, loser id, merge id |
| `core.account.unmerged` | A merge was undone | Winner id, loser id, merge id |
| `core.account.erased` | The erasure batch committed | Account id |
| `core.account-email.verified` | An address was proved | Account id, address id |
| `core.account-email.removed` | An address was removed | Account id, address id |
| `core.grant.created` | A grant was written | Grant id, account id, role id |
| `core.grant.ended` | A grant was ended early | Grant id, account id, role id |
| `core.grant.expiring` | The warning period before a lapse begins | Grant id, account id |
| `core.role.changed` | A role's abilities were edited | Role id |
| `core.data-request.finished` | An export or erasure finished | Request id, kind |

- A lapse writes nothing, so it announces nothing. `core.grant.expiring` comes from a daily task.
- A listener that keeps anything keyed to an account listens for `merged` only if it caches; the batch has already moved its rows.
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
| `core.merge-handler` | code | Given winner and loser, the statements for rows a plain move would break, and a count for the preview | Every reference is a plain move or an alias |
| `core.export-contributor` | code | Given an account, extra material for the export that the data-class registry cannot find, such as files | The export holds registry rows only |
| `core.account-section` | data | A section on the "My account" page or on the console's account page: its id, side, the ability that shows it, and the component | Only identity's own sections show |

Identity also uses three points the foundations draft already offers: `core.navigation` for its own screens, `core.erasure-handler` for anything a module must do beyond the registry, and `core.record-resolver` to turn an account id into a label and a link.

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
| `core.run-erasure` | Job | Runs the erasure batch for a confirmed request whose cooling-off is over and which has no holds |
| `core.sweep-identity` | Task, hourly | Deletes spent tokens, challenges and long-ended sessions; closes merge undo windows; removes unverified addresses |
| `core.warn-grants` | Task, daily | Announces `core.grant.expiring`; lists pending grants nobody claimed |
| `core.review-data-requests` | Task, daily | Re-checks held erasures; warns staff of any request nearing its respond-by date |
| `core.sweep-accounts` | Task, daily | The unclaimed and dormant sweeps, in report-only mode until armed |

## Secrets

| Secret | Needed | For |
| --- | --- | --- |
| `CORE_SESSION_KEY` | Always | Deriving the hashes of tokens and the browser binding |
| `CORE_PROFILE_KEY` | Always | Encrypting access profiles; versioned so it can be rotated |
| `CORE_GOOGLE_CLIENT_SECRET` | When used | Google sign-in |
| `CORE_OWNER_RECOVERY` | Optional | Present only while an owner is being recovered |
| `CORE_TURNSTILE_SECRET` | Optional | Not identity's: bot protection is one core service with the secret CORE\_TURNSTILE\_SECRET\_KEY, and the sign-in routes opt in through their route declaration |

## What each workstream must do to fit

| Workstream | Must |
| --- | --- |
| 3. Core domain | Declare the fact for a place on a production's team; mark production and venue as grantable record types; take a side when sending a notification |
| 4. Box office | Call `findOrCreateAccount` at checkout and at the desk; declare its account references as move or alias; contribute an erasure hold for unsettled money and unused tickets; contribute its "Tickets and orders" section to My account on the audience side |
| 5. Form builder | Let a form attach fields to `core.account` with a side; contribute those fields as account sections |
| 6. Interface | Draw the header from `describeViewer` and nothing else; never test for a role in a page |
| Later modules | Membership, Front of house and Training each declare their fact and say whether it is a standing |
