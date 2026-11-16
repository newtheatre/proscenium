# 1. Scope

Identity is part of the always-on core. It answers four questions for every other module: who is this, how sure are we, what may they do here, and which side of the theatre are they on.

## In scope

| Area | What this specification settles |
| --- | --- |
| The account | One record per person, its states (unclaimed, claimed, disabled, merged, anonymised) and the name and contact details it holds |
| Addresses | Several verified email addresses on one account, and which address each side of the theatre writes to |
| Sign-in | Passkey, emailed link with a code, and Google, behind one provider interface (decided: passkey plus email link, Google first) |
| Sessions | Server-held sessions, how sure each one is, re-assertion for sensitive actions, the list of a person's own sessions, revocation |
| Recovery | Recovery codes, a staff-issued enrolment link, and a route back for a locked-out owner that needs no developer |
| The two experiences | What everybody gets, what opens the members' area, what opens the console, and the rules that keep audience members away from member features |
| Roles and authority | Roles as data a theatre names, grants with a scope and an expiry, authority derived from facts, ownership, and the one resolver every module asks |
| Adding people | Invitations, accounts made by staff, accounts made at guest checkout, and grants that wait for a first sign-in |
| Merge | Joining two accounts, by the person or by staff, and undoing it |
| Privacy | Downloading your own data, erasure as anonymisation, and retention of unused accounts |
| Protected profile | Emergency contacts and access needs, with who may read them |
| People console | The directory, the account page, roles, the grants register and the data-request queue |

## Out of scope

| Left out | Where it belongs |
| --- | --- |
| Membership types, terms, fees and verification | The Membership module, in the later round. It tells identity who is currently a member; identity never stores that. |
| Marketing consent and mailing lists | Communications, later round. Identity only fixes that consent is recorded per side. |
| Sending messages, templates, the inbox | Notifications in workstream 3. Identity says which address a message goes to. |
| Orders, baskets, tickets, the customer record | Workstream 4. It calls identity to find or make the account behind an order. |
| Credited names on public pages | Workstream 3, as part of the production record. |
| The manifest and registry file formats | Workstream 1. This document lists what identity registers in those formats. |
| How the shells look | Workstream 6. This document says who gets which shell and what must be in the header. |
| Passwords, Microsoft sign-in | Not in the first release. Each is one more sign-in provider and changes no table here. Question 4 records Matt's decision on passwords; Microsoft is later. |
| Service accounts and API keys | Later. Nothing in the first release signs in without a person. |
| Households, children's accounts held by a parent | Later. A youth theatre will need it; the account model leaves room (see the data model's last section). |
| Signing in as somebody else | Never. Staff act on a person's behalf under their own account, and the record says so. |
| Importing NNT's accounts | Not a concern (decided). A standalone tool if it is ever wanted. |

## What this assumes of the other workstreams

| Of | Assumption |
| --- | --- |
| 1. Foundations | An ability entry carries the least assurance it needs, whether it needs a fresh check, and the levels it may be granted at (`assurance`, `fresh`, `grantAt`). Settled; identity's values are in part 6. |
| 1. Foundations | A column's data-class entry can also say that it refers to an account, and what merge and erasure do with it. Identity's merge and erasure are driven entirely by those entries. |
| 1. Foundations | A module can register plain functions with the core at start-up (an authority source, a standing source, an erasure hold). Events alone are not enough, because authority is read at the moment of a write. |
| 1. Foundations | Rate limits are declared per route, and their numbers are settings. |
| 1. Foundations | A service can hand back statements for the caller's batch, so an audit entry or a grant lands atomically with the change it belongs to. |
| 3. Core domain | Core domain declares the setting `core.organisation.year-end` (a day and month, unset until setup). Grants that expire at the year end read it; while it is unset, "year end" cannot be chosen as an expiry. |
| 3. Core domain | Notifications accepts an account and a side (audience or members) and asks identity for the address. |
| 3. Core domain | Files holds a data export privately and expires it. |
| 1. Foundations | Foundations specifies the audit service and its table `core_audit`. Identity supplies the actor, the session, the assurance level and what allowed the action. |
| 4. Box office | It never asks whether a buyer is a member. Member prices come from requirements.check, the core.requirement point, which box office calls; fact:core.member is a valid reference there. |
| 5. Form builder | A theatre's extra questions about a person (course, dietary needs) are form-builder fields attached to the account, each marked audience or members; that is a later form builder story. Identity ships none of them. The access-needs and emergency-contact questions are identity's own screens in the first release. |
| 6. Interface | Three shells exist: public, members and console. The header takes its entries from identity's description of the signed-in person. |

## Words used here

| Word | Meaning |
| --- | --- |
| Account | The one record for one person. |
| Unclaimed account | An account nobody has ever signed in to: a guest buyer, an invited officer, a trainee on a paper register. |
| Side | Audience or members. Every screen, message and consent belongs to exactly one. |
| Standing | A current fact that puts a person on the members' side: a membership, a role, a shift, a place on a production. |
| Ability | One thing a person may do, declared by a module. |
| Role | A named bundle of abilities that a theatre defines. |
| Grant | A role given to an account, at a scope, until a date. |
| Assurance | How strongly a session has proved who it is: basic or strong. |
