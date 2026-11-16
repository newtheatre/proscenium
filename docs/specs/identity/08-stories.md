# 7. Stories

Thirty-seven stories, each with criteria a test can check. Thirty-one are in the first release: nine needed at the gate before anything else can be built, and twenty-two others. Six wait. A story is "first release" when box office or front of house cannot open safely without it.

| Group | First release | Later |
| --- | --- | --- |
| Getting in | ID-01 to ID-10 |  |
| My account | ID-11 to ID-17 | None |
| Audience and members | ID-18 to ID-21 |  |
| Roles and permissions | ID-22 to ID-24, ID-28, ID-29 | ID-25, ID-26, ID-27 |
| People in the console | ID-30 to ID-32, ID-35, ID-37 | ID-33, ID-34, ID-36 |

## Getting in

### ID-01 Sign in or sign up by email (first release)

As anybody, I type my address and get a link and a code, so that I need no password.

- The screen after submitting is identical whether or not an account exists for the address.
- The link works once and only within `core.sign-in.link-lifetime`; a second use shows "this link has been used" and signs nobody in.
- The code works only in the browser that asked for it, and dies after `core.sign-in.code-attempts` wrong tries.
- No account row exists until the link or code is used; an abandoned sign-up leaves only an expired token.
- With `core.sign-in.open-sign-up` off, an unknown address gets the same screen and no email.

### ID-02 Sign in with a passkey (first release)

As a returning person, I sign in with my device, so that it takes one tap.

- No address needs typing; the browser offers the passkeys it holds for the site.
- The session it creates is marked strong.
- A passkey removed from the account cannot sign in, even if the device still holds it.

### ID-03 Be offered a passkey after first signing in (first release)

- The offer appears once after an email sign-in on an account with no passkey, and can be skipped.
- Adding the first passkey offers recovery codes. Anyone may skip them except an Owner, who must type one back before the page can be left.
- Staff holding a privileged ability are told the console needs a passkey, and what to do, before they hit a refusal.

### ID-04 Sign in with Google (first release)

- The button appears only when `core.sign-in.google` is on.
- A Google account whose email Google has not verified links to nothing and signs nobody in.
- With accepted domains set, an account outside them is refused with a message naming the domains.
- An address in a managed domain cannot ask for an emailed link; the screen sends the person to the provider.

### ID-05 Buy without signing in (first release)

As an audience member, I check out as a guest, so that I am not made to register.

- Checkout finds or creates the account for the address, unclaimed, and creates no session.
- A second guest order with the same address attaches to the same account.
- Signing in later with that address claims the account, and the earlier orders are there.
- An unclaimed account can never be the actor of a request.

### ID-06 Be invited (first release)

As staff, I add a person by name and address and give them a role before they have ever signed in.

- The grant shows as "waiting for first sign-in" until they do, and counts for nothing until then.
- The invitation link works within `core.sign-in.invite-lifetime`; after that an ordinary sign-in with the same address still claims the account and the role.
- Adding an address that already has an account offers that account instead of creating a second.

### ID-07 Land where I was going (first release)

- After signing in by any method, the person arrives at the page they first asked for.
- A return address that is not a path on this site is ignored.
- A fresh re-assertion completes the action that asked for it, without the form being filled in again.

### ID-08 Recover a lost passkey (first release)

- A recovery code works once and gives a session that can do one thing: enrol a new passkey.
- A staff-issued enrolment link does the same, works once, and lapses after `core.recovery.enrolment-link-lifetime`.
- Every recovery, and every new passkey, sends a notice to all the account's verified addresses.
- Staff cannot issue an enrolment link for themselves.

### ID-09 Owner break-glass (first release)

As the person who runs the deployment, I can get an Owner back in when every Owner is locked out.

- The route answers only while the `CORE_OWNER_RECOVERY` secret is set, and only to its value.
- Using it enrols a passkey on an existing Owner account; it cannot create an Owner.
- A health check stays red while the secret is set, and the use is audited.

### ID-10 Sign-in is hard to abuse (first release)

- Requests for links are limited per address and per network address; over the limit shows the ordinary "check your email" screen and sends nothing.
- The routes that send email declare core's bot challenge; the server refuses a missing or failed one, and refuses outright, with a red health check, if the challenge secret is not set.
- Tokens are stored as hashes; a copy of the database signs nobody in.

## My account

### ID-11 Edit my details (first release)

- A person can change their name, the name they are known by, and pronouns.
- A change shows at once everywhere the account's label is used.

### ID-12 Manage my email addresses (first release)

- An added address does nothing until verified, and is removed after `core.sign-in.unverified-address-lifetime`.
- An address verified on another account cannot be added; the message offers the merge route and reveals nothing about the other account.
- The last verified address cannot be removed.
- Changing the audience address or the members' address sends a notice to the old one.

### ID-13 See and end my sessions (first release)

- The list shows each session's device, when it started, when it was last used, and which one is this one.
- Ending a session takes effect on its next request.
- "Sign out everywhere else" leaves only the current session.

### ID-14 Manage passkeys and recovery codes (first release)

- Adding or removing a passkey needs a fresh re-assertion.
- The only way in cannot be removed: the last passkey stays unless the account has a verified address that may receive links, or a provider link.
- Making new recovery codes ends the old set.

### ID-15 Download my data (first release)

- The download holds what every module's export contributor returns for the account, in open formats, with a readable index.
- It is ready as a link in the account, announced by email, and gone after `core.privacy.export-lifetime`.
- Asking needs a fresh re-assertion.

### ID-16 Erase my account (first release)

- The request must be confirmed from an emailed link, then waits `core.privacy.cooling-off`, during which the person can cancel.
- A module's hold (an unsettled order, an open incident) pauses it and the person is told why in plain words.
- When it runs, every personal column on every table that references the account is cleared in one batch, sessions end, and the address can be used for a new account.
- Running it twice changes nothing the second time.

### ID-17 Emergency contacts and access needs (first release)

- A person records contacts and access needs in their account and chooses who the access needs are shared with.
- Both are stored encrypted, and every read by staff is audited with the reader and the reason.
- Neither appears in a search result, a list or an export other than the person's own.

In the first release these are identity's own screens, not a form builder form.

## Audience and members

### ID-18 An audience member sees nothing of the members' side (first release)

This is the eight separation rules in part 3, as one story.

- No page, menu, search result, email or error shown to a person without a standing names a members' feature.
- A members' address opened without a standing gives the same "not found" as an address that does not exist.
- The public shell's code bundle contains no members' or console screens.

### ID-19 A member has one account for everything (first release)

- The account that buys tickets is the account that holds the standing; nothing asks the person to register again.
- The members' area opens on the first request after a standing begins, with no sign-out needed.
- A member's tickets, orders and details sit in the same My account an audience member has.

### ID-20 One header that adapts (first release)

- Signed out: Sign in. Audience: My account. Member: My account and the members' area, under the name in `core.members-area.name`. Staff: those and the console.
- With `core.members-area.enabled` off, no member entry appears for anyone.

### ID-21 Losing a standing is quiet (first release)

- When the last standing ends, the members' area closes on the next request.
- Orders, tickets and account details are untouched, and the person is never signed out.

## Roles and permissions

### ID-22 Create and edit roles (first release)

- A role is a name, a set of abilities, an expiry rule and whether it opens the members' area.
- Ticking an ability ticks what it implies, and the implied ones are shown locked.
- A person can put into a role only abilities they hold themselves.
- The Owner role cannot be edited or archived.

### ID-23 Give somebody a role (first release)

- A grant names a person, a role, a scope and an end date, and records who made it.
- Nobody can grant a role to themselves, or a role holding an ability they lack at that scope.
- Changing a grant ends it and writes a new one; the history shows both.
- An ended grant stops counting on the holder's next request.

### ID-24 Roles expire (first release)

- A role with the year-end rule gives every new grant the next year end as its end date, read from core.organisation.year-end; while that is unset the rule cannot be chosen.
- The holder and the granters are told `core.grants.expiry-warning` ahead.
- Renewal is one action over a list, and each renewal is a new grant.

### ID-25 Delegate on one production (later)

- A person holding `core.grant.manage` on a production can grant there and nowhere else.
- The screen is reached from the production, not from the console's people section.

### ID-26 Map abilities to facts (later)

- Staff choose which abilities a fact carries, exactly as for a role.
- A privileged ability needs an explicit confirmation naming the fact and the ability.
- The authority ends when the fact does, with nothing to revoke.

### ID-27 See why somebody can do something (later)

- For a person and an ability, the screen names the grant, fact or ownership that allows it, or says nothing does.

### ID-28 Sensitive actions ask again (first release)

- A privileged ability is refused on a basic session with a message that says how to get a strong one.
- A privileged change outside `core.access.fresh-within` opens the re-assertion dialogue in place and then completes.
- A basic session cannot be upgraded by an emailed link.

### ID-29 The theatre always has an Owner (first release)

- Ending, disabling, merging or erasing is refused when it would leave no Owner who can sign in strongly.
- Only an Owner can grant or end Owner.
- The check is part of the write, so two Owners removing each other at once cannot both succeed.

## People in the console

### ID-30 Find and view a person (first release)

- Search by name or address returns a name and enough to tell two people apart, never contact details, to anyone with `core.account.search`.
- The account page shows identity's own facts; each module's section appears only to somebody with that module's ability.
- Opening an account page is audited.

### ID-31 Disable an account (first release)

- Disabling ends every session at once and stops new ones; nothing is deleted.
- The person sees "this account is disabled, contact the theatre" only after proving they own it.
- Staff cannot disable themselves.

### ID-32 Merge two accounts (first release)

- The screen shows both accounts side by side with what will move, and asks which one survives.
- After the merge, every reference to the old account resolves to the survivor, and a test that walks the registry proves none was missed.
- Addresses, passkeys and grants move; sessions on the old account end.
- The merge is one batch: it happens entirely or not at all.

### ID-33 Undo a merge (later)

- Within `core.merge.undo-window`, the moved rows listed in the merge's manifest go back, and rows made since stay with the survivor.
- After the window the old account's remaining personal data is cleared and undo is no longer offered.

### ID-34 Merge my own two accounts (later)

- A person signed in to one account proves the other by signing in to it, strongly on both if either holds a role.
- Nothing about the other account is shown before that proof.

### ID-35 Handle data requests (first release)

- Staff see every request with its state, its deadline from `core.privacy.respond-within`, and any hold with its reason.
- Staff can start a request for somebody who asked by other means, recording how identity was checked.
- A held erasure can be released only by the module that holds it clearing its own condition. Tables that may hold rows linked to no account are listed as a checklist for staff to search by hand, and a request cannot be marked complete until every line is ticked.

### ID-36 Retention sweeps (later)

- Until `core.retention.armed` is on, a sweep only reports what it would do.
- Armed, a run anonymises at most `core.retention.run-cap` accounts and never one with a hold, a role or a future ticket.
- A dormant account is warned by email twice before it is touched.

### ID-37 First-run setup makes the first Owner (first release)

- On an empty database, inside the first-run sequence that foundations owns and behind its setup code, identity's step creates one Owner, and requires a passkey and saved recovery codes before it finishes.
- Once an Owner exists the step cannot run again.
