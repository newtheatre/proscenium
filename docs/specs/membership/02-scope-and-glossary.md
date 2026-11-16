# 1. Scope and glossary

Membership records which people belong to which of a theatre's schemes, for how long, and what that entitles them to. It decides one thing other modules rely on: whether a person holds a current membership today.

## The two modules

| Module | Id | Table prefix | Requires | Uses | Switchable | On in presets |
| --- | --- | --- | --- | --- | --- | --- |
| Membership | `membership` | `membership_` | `forms` | `communications`, `box-office`, `front-of-house` | Yes | Student society, amateur company |
| Membership fees | `membership-fees` | `membership_fees_` | `membership`, `payments`, `finance` | none | Yes | Amateur company |

They are specified together because they ship together, as box office, payments and finance were. They are two modules because a theatre whose members pay nothing, or pay somebody else (a students' union), must not have to switch on Payments and Finance to keep a member list. Foundations allows no either-or dependency, so the part that needs money is its own module.

`membership` may never name a table `membership_fees_*`; a check should reserve that prefix for the fees module.

## In scope

| Area | What |
| --- | --- |
| Schemes | The kinds of membership a theatre offers: name, side, length, how to join, what is checked, whether it costs |
| Joining | Applying through a form, verification, approval, payment, activation |
| Granting | Staff adding a member directly, including honorary and life members |
| Renewal | The renewal window, reminders, renewing early or after a lapse |
| Ending | Cancelling, ending by staff, ending on a full refund, lapsing by date |
| The standing | The fact that opens the members' area, and the fact for supporters that does not |
| Benefits other modules read | A requirement source for member pricing in Box office (BO-20), facts for the form builder and for a theatre's own ability mappings, a voting fact |
| Verification | The point `membership.verifier` and three shipped verifiers: staff, email domain, uploaded list |
| Fees | A price for each length of a scheme, a charge per membership, payment online or at the desk, refunds, ledger postings |
| A member's own view | My membership: status, a card to show at the door, renewing, history |
| Staff views | Members, applications needing attention, schemes, verification lists |

## Out of scope

| Not here | Where it belongs |
| --- | --- |
| Accounts, sign-in, roles, grants, the members' area itself | Identity (workstream 2) |
| Building the application form, review stages, custom fields | Form builder (workstream 5). Membership offers form slots and an outcome action |
| Payment providers, attempts, refunds, the ledger | Payments and Finance (workstream 4) |
| Ticket types, prices and quantity limits for members | Box office. Membership only answers whether a buyer meets a membership requirement |
| Door codes, scanning and the check at entry | Box office (BO-45). Membership supplies the card's code and answers the requirement again when asked |
| Access needs and the access scheme | Core. The access scheme is a separate matter and is not a membership |
| Mailing lists and messages to all members | Communications. Membership contributes each scheme's holders to it as an audience source |
| Season passes and multi-buy passes | Box office (`box_office_passes`). A pass is a prepaid entitlement to tickets, not a membership |
| Training, shifts, casting | Training, Front of house, core productions |
| Elections and ballots | Not specified anywhere yet. Membership declares the voting fact a ballot would need |
| A public directory of members | Deliberately absent. Nobody's membership is shown to another member |

## What the first release holds

| First release | Later |
| --- | --- |
| Schemes on either side, fixed-date, rolling or indefinite, each with one or more lengths | Joint, family and corporate memberships (one membership, several people) |
| Joining by form, with the three shipped verifiers and optional approval | Verification against an outside system's API (a theatre's own contribution is possible from day one) |
| Staff adding a member, honorary and life membership, import of members from a file, custom fields about members | Recording a fee taken by somebody else |
| Renewal with reminders | Renewal taken automatically from a stored card |
| The standing, the supporter fact, the scheme fact, the voting fact | Capped schemes and waiting lists |
| The requirement source that member pricing reads, by account or by a reference typed at the checkout | Pro-rata fees for a part year; concession prices |
| Fees: a price for each length of a scheme, paid online or at the desk, alone or with tickets, staff refunds, ledger postings | Self-service refund inside the cooling-off period |
| My membership with a scannable card; members and applications lists | Reports: joiners, renewals, retention by year |

## The pain point this must fix

At Nottingham New Theatre audiences and members had no clear separation: an audience member could meet member features, and a member could end up with two accounts. Five rules in this specification answer that, and each has a never-regress test in tab 8.

1. A membership is attached to an existing account. No flow in this module creates a sign-in, and the only way it creates an account is staff adding a person by address through Identity's `findOrCreateAccount`, which never makes a second account for an address.
2. Everything a non-member needs (what schemes exist, how to join, the state of an application) is on the audience side, under My account. Nothing about membership is first reachable only from inside the members' area.
3. Only a current membership of a members' scheme gives a standing. A pending application, a lapsed membership and a supporters' scheme give none.
4. A response to somebody without the standing never contains a members' navigation entry, a members' address or a count of members' things. Identity enforces this; Membership adds no route of its own under `/members` that answers differently.
5. Ending a membership changes nothing on the audience side. Orders, tickets, form responses and the account stay exactly as they were.

## Glossary

Words this specification owns. Words owned elsewhere are used in their owners' sense: account, unclaimed account, standing, side (Identity); form slot, response, outcome action (Form builder); payment intent, attempt, posting (Box office, payments, finance); point, fact, ability, record type, unit of work (Foundations).

| Word | Meaning |
| --- | --- |
| Scheme | One kind of membership a theatre offers, such as "Student member" or "Friend". A theatre may have any number |
| Members' scheme | A scheme on the members' side. Holding it currently is a standing |
| Supporters' scheme | A scheme on the audience side. Holding it gives benefits and no standing |
| Membership | One person's holding of one scheme for one span of dates. A renewal is a new membership linked to the one before |
| Holder | The account a membership belongs to |
| Supporter | The holder of a current membership of a supporters' scheme |
| Application | A membership in the state `pending`, from the moment a person applies until it is active, declined or expired |
| Requirement | One of the three things a scheme may ask before a membership becomes active: verification, approval, payment |
| Active | The stored state of a membership whose requirements are all met and which has not been ended |
| Current | Active, and today is on or between its start and end dates, counting any grace. Derived at each request, never stored |
| Upcoming | Active with a start date in the future, as a renewal made early is |
| In grace | Active, past its end date, inside the scheme's grace days. Still current |
| Lapsed | Active, past its end date and any grace. No longer current. Derived |
| Length rule | How a scheme sets a membership's dates: fixed-date, rolling or indefinite |
| Length option | One of the lengths a scheme may be held for, such as 1 year or 3 years, with its own price where fees are on |
| Reference | A value that stands for a membership without signing in: an entry on a scheme's reference list, such as a student ID, or a holder's member number |
| Evidence | The opaque id a met requirement answer carries, kept by the host so the same entitlement can be judged again at entry |
| Renewal window | The days before a membership's end date in which its holder may renew |
| Rollover days | For a fixed-date scheme, the days before the end date in which a new joiner is given the following year as well |
| Verifier | A contribution to the point `membership.verifier`: a way of checking that a person is entitled to a scheme |
| Verification list | An uploaded list of addresses or reference numbers that the list verifier matches against. An entry may carry an end date and a name |
| Member number | A short number given to a person the first time they hold any membership, and kept for good |
| Price | The fee for a scheme, in the fees module |
| Charge | What one membership owes: the record a payment intent is opened for |
| Grant | Avoided here. Identity owns "grant" for roles. Staff "add" a member |

## Three words with a ruling

| Word | Clash | Ruling |
| --- | --- | --- |
| member | Identity: anyone with a standing, by role, shift, production or membership (`core.member`). Membership: the holder of a scheme | "Member" alone keeps Identity's meaning. A person with a membership is a "membership holder", and a supporter is never called a member. That is why the fact is `membership.holder` and not `membership.member` |
| term | Core: an entry in a vocabulary. Everyday speech: the span of a membership | Never "term" in this module. The fixed stretch a fixed-date scheme runs for, such as an academic year, is a "scheme year" |
| period | Finance: an accounting period | "Period" never stands alone. The span one person's membership runs, from its start date to its end date, is a "membership period" |
