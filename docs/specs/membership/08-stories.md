# 7. Stories

58 stories, MEM-01 to MEM-58: 49 in the first release, of which 9 are gate stories, and 9 later. A gate story must be finished and proved before the stories that rest on it start.

|  | Stories | Gate | Rest of first release | Later |
| --- | --- | --- | --- | --- |
| `membership` | 44 | 8 | 33 | 3 |
| `membership-fees` | 8 | 1 | 7 | 0 |
| Either, later only | 6 | 0 | 0 | 6 |
| **All** | **58** | **9** | **40** | **9** |

## What the stories rest on

| Needs | From | For |
| --- | --- | --- |
| The kit, the unit of work, facts, points | Foundations, step 0 | Everything |
| Accounts, sign-in, the members' area, `core.member`, `findOrCreateAccount`, merge and erasure | Identity, phases 1 and 2 | The gate |
| Notifications and files | Core domain, phase 2 | Reminders, list upload, export |
| Form slots, `addResponse`, decision stages | Form builder: FB-501, FB-502, FB-503 (for the membership record) and FB-506, brought into the first release for this | MEM-12, 16, and custom fields. The gate does not need a form |
| `core.requirement` | Foundations, with the kit | MEM-35 |
| Payments and Finance | Phase 3 | MEM-36 to MEM-42 |

The gate (MEM-01, 06, 07, 08, 11, 18, 24, 35) needs only Foundations, Identity and the console shell. It can therefore be built as soon as phase 2 is done, ahead of the form builder, and BO-20 stops waiting on it. MEM-37 is the fees module's own gate.

## Schemes

| Id | Story | Done when | Release |
| --- | --- | --- | --- |
| MEM-01 | As a membership officer I create a scheme and say which side it is on and how long it lasts | A scheme is saved as a draft with a side and a length rule; the screen shows a live example of the dates; the side is locked once a membership exists (S2) | First, gate |
| MEM-02 | As a membership officer I open, close and archive a scheme | Opening lists anything missing (S4). Closing and archiving show how many holders and applications are affected. A closed scheme takes no new joiners and still renews | First |
| MEM-03 | As a membership officer I attach an application form to a scheme | The form builder's placement control attaches a form in `membership.application`; the slot forbids payment questions. The ready-made template waits for the form builder's FB-510, which is later | First |
| MEM-04 | As a membership officer I choose how a scheme's members are verified | A verifier is chosen and configured with its own component; an invalid configuration blocks opening | First |
| MEM-05 | As an administrator I let somebody manage one scheme only | A grant scoped to one scheme gives its abilities on that scheme and its memberships, and nothing elsewhere | Later |
| MEM-56 | As a membership officer I offer one scheme for different lengths, such as 1 year and 3 years | A scheme has one or more length options; the applicant chooses when there is more than one; dates follow D8; a price may be set per option; a staff check may change the option before passing (D10) | First |

## The standing

| Id | Story | Done when | Release |
| --- | --- | --- | --- |
| MEM-06 | As a member I see the members' area as soon as my membership is active, with the account I already had | `membership.holder` holds for a current membership of a members' scheme; `core.member` follows; the header shows the members' entry on the next response; no second account exists | First, gate |
| MEM-07 | As a supporter I get my benefits and never see member things | A current membership of a supporters' scheme makes `membership.supporter` true and `membership.holder` false; no members' entry, address or count reaches me | First, gate |
| MEM-08 | As a former member I lose the members' area when my membership ends and keep everything else | The day after the end of grace the members' entry is gone with no task having run; my tickets, orders and responses are unchanged; My membership still opens | First, gate |
| MEM-09 | As a theatre I can restrict something to voting members | `membership.voter` holds only for schemes marked voting, after the qualifying period; it is offered wherever facts are listed | First |

## Joining

| Id | Story | Done when | Release |
| --- | --- | --- | --- |
| MEM-10 | As a visitor I can see what memberships the theatre offers and what each costs | Open schemes show in My account and in the component `MembershipSchemes`; signed-out listing follows its setting | First |
| MEM-11 | As an audience member I join a free scheme with nothing to check in one step | One request writes an active membership with dates by the scheme's rule and a member number; I am never asked for a name, address or password | First, gate |
| MEM-12 | As an applicant I answer the theatre's application form as part of joining | The form renders in the join steps, is checked on the server, and its response is written in the same unit as the application (J1) | First |
| MEM-13 | As an applicant I can leave and come back | The page reopens at my next unmet step; the application expires after the setting only while the next step is mine (J5) | First |
| MEM-14 | As an applicant I can withdraw | The application ends, its response is withdrawn and any open charge is void | First |
| MEM-15 | As a theatre I can make any form start a membership | The outcome action `membership.start-membership` runs once per response, however often it is called | Later |
| MEM-16 | As a committee we approve applicants before they become members | A scheme needing approval opens only with a form that has a decision stage; approved sets the requirement; declined ends the application and tells the person | First |
| MEM-17 | As a signed-out visitor pressing Join I am taken through sign-in and brought back to the same scheme | Signing in with an address I once bought tickets with lands me on the join page with my existing account and history | First |

## Verification

| Id | Story | Done when | Release |
| --- | --- | --- | --- |
| MEM-18 | As a membership officer I pass or decline applications waiting to be checked | The Applications list shows what each waits for; Pass and Decline take a note and are audited; my own application is never in my queue | First, gate |
| MEM-19 | As a student I am verified by my university address | A verified address at a listed domain passes at once; without one I am told to add it, and verifying it completes the check without my returning (the listener on `core.account-email.verified`) | First |
| MEM-20 | As a membership officer I upload the students' union's list and members are verified against it | A file of up to three columns (address or reference, end date, name) loads with the first column as hashes; importing again keeps the id of every entry whose reference is unchanged; the file is deleted; a verified address on the list passes; no screen or route shows the list | First |
| MEM-21 | As a theatre whose members are identified by a number from another body, each number is claimed by one account | A typed reference matching an unclaimed entry passes and claims it; a claim from a second account goes to staff with the reason | First |
| MEM-22 | As a developer for a theatre I add my own verifier | A module under `site/layers/x-*/` contributes to `membership.verifier` and appears in the scheme screen; the documentation has a worked example | Later |
| MEM-23 | As a theatre I check entitlement again each year | Renewal re-runs the verifier when the scheme says so; a renewal that fails waits like any application | First |
| MEM-57 | As a membership officer I keep the list of who the students' union says is a member, with when each ends, without those people needing accounts | Entries carry an end date; a membership verified by an entry ends on it (D9); I can add or remove one entry by hand, check a reference and see whose it is without seeing the list, and search by name to redact a row (V19); an ended entry matches nothing; a name is erased after its setting (V18) | First |

## Staff work

| Id | Story | Done when | Release |
| --- | --- | --- | --- |
| MEM-24 | As a membership officer I add a member directly, by picking a person or giving a name and address | The membership is active at once; an address reuses any account that has it and otherwise makes an unclaimed one; I cannot add myself; the summary line says whether they will see the members' area | First, gate |
| MEM-25 | As a committee we make somebody an honorary or life member | A staff-only, indefinite scheme can be entered only by staff, never lapses and gets no reminders | First |
| MEM-26 | As a membership officer I see who our members are and who is about to lapse | The Members list has the saved views of tab 5; status is derived; custom fields can be columns; opening the list is audited as a read | First |
| MEM-27 | As a membership officer I export the members I am looking at | The export is built as a bulk job, delivered through Files, needs the export ability and is audited | First |
| MEM-28 | As a membership officer I correct a membership's dates or end it, with a note | Dates change under D7 with both sets audited; ending is guarded, needs a note and warns of any renewal already made | First |
| MEM-49 | As a membership officer I import last year's members from a file | A dry run reports the rows that would be refused; the import then runs as a bulk job, written set-wise, finding or creating each account through findOrCreateAccount; a row for my own account is refused; it needs membership.membership.import and is audited | First |

## Renewal and ending

| Id | Story | Done when | Release |
| --- | --- | --- | --- |
| MEM-29 | As a member I renew before my membership ends and lose no days | Renewing in the window writes a membership starting the day after the old one ends; a second press returns the first renewal | First |
| MEM-30 | As a member I am reminded in good time | The three reminders of rule R8 are sent once each, on the right side, and not at all to somebody who has renewed | First |
| MEM-31 | As a lapsed member I can come back | Renewing after the lapse starts today and keeps "member since" and my number | First |
| MEM-32 | As a member I can end my own membership | Offered only where the scheme allows it (holder\_may\_end). A confirmation says what I lose; it ends today; nothing on the audience side changes | First |

## A member's own view

| Id | Story | Done when | Release |
| --- | --- | --- | --- |
| MEM-33 | As a member I can see what I hold, until when, and show a card | My membership shows each membership with number and end date, open applications with their next step, and a full-screen card | First |
| MEM-34 | As a theatre we keep our own details about members, such as course and year | A record-mode form in `membership.member-fields` shows on the membership's record and to the holder, with the form builder's read rules | First |
| MEM-51 | As a steward or seller I scan a membership card and see whether it is current | My membership shows a code in Box office's door code format, signed by the kit under box-office.door-code; Membership's contribution to that point resolves it to a headline and one line for holders of membership.card.check; a scan never admits and writes no scan row; a card signed with a retired key is replaced by opening the page again | First |

## Benefits

| Id | Story | Done when | Release |
| --- | --- | --- | --- |
| MEM-35 | As Box office I can ask whether a buyer meets a membership requirement without knowing what membership is | The source on `core.requirement` offers its options, describes a reference, and answers met or not met for an account at an instant, with evidence and a summary for staff; a check about another account needs its `checkAbility`; BO-20's acceptance passes with Membership on and reads as unavailable with it off | First, gate |
| MEM-58 | As a member I get the member price by typing my student ID or member number, without signing in, and I can book for a friend who is also a member | Where the scheme accepts a reference, a list entry or a current member number answers met with evidence (V8 to V11) and creates nothing else (I10); the description is presentable with the theatre's full label (V13); one reference meets one ticket (V14); a miss gives nothing away (V15); the account route and the reference route return one evidence (V11); the evidence answers again at entry; holder(evidence) returns the name to staff only (V18) | First |

## Fees

| Id | Story | Done when | Release |
| --- | --- | --- | --- |
| MEM-36 | As a finance officer I set what a scheme costs, and a different price to renew | A price has a from-date and a tax code; a new price never edits an old one; a charge copies the price it was made at | First |
| MEM-37 | As an applicant I pay online and am a member the moment the payment succeeds | One batch marks the charge paid, posts the income and activates the membership; if any part refuses, none happens; the reconciliation checks of tab 4 read zero | First, gate |
| MEM-38 | As an applicant whose payment lands after my application expired, I get my money back | `cannotSettle` answers true; Payments marks the intent unfulfilled and refunds; no membership is created | First |
| MEM-39 | As desk staff I take a membership fee in person | The fee is taken on the desk channel in an open till session by any offered method; the same settle handler activates the membership | First |
| MEM-40 | As a finance officer I waive a fee with a reason | The charge is void, the requirement is met, the reason is audited, and I cannot waive my own | First |
| MEM-41 | As a finance officer I refund a fee | The refund follows Payments' approval rule; the posting is reversed; a full refund ends the membership when the setting says so | First |
| MEM-42 | As a theatre that switches fees off, nobody joins a paid scheme for free | A scheme that requires payment shows as not available online while nothing answers `membership.charge`; staff can still add a member | First |
| MEM-53 | As desk staff I sell a membership and tickets in one payment | The fees module's panel in payments.desk-basket sits beside Box office's in one basket; one payment settles both parts or neither (P8) | First |

## Platform duties

| Id | Story | Done when | Release |
| --- | --- | --- | --- |
| MEM-43 | As a person with two accounts being merged, my memberships come with me | Rule X2 holds, including the duplicate application and the two member numbers; undoing the merge restores both sides | First |
| MEM-44 | As a person asking to be erased, my membership ends and my details go | Live memberships end as `erased`; notes are redacted; rows and the number remain for counts; the walking erasure test passes for both modules' tables | First |
| MEM-45 | As an administrator I am guided through setting up membership and told when something is wrong | The setup steps and health checks of tab 4 exist and link to where each is fixed | First |
| MEM-46 | As an administrator switching Membership off, I am told who will lose access | The switch shows how many people have no other standing before it is confirmed; switching back on restores every current membership with nothing run | First |

## Later

| Id | Story | Done when | Release |
| --- | --- | --- | --- |
| MEM-47 | As a member I renew automatically from a stored card | Needs a provider capability for stored methods and consent wording | Later |
| MEM-48 | As a family or a company we hold one membership between several people | One membership with several holders, a lead holder and a limit | Later |
| MEM-50 | As a committee we see joiners, renewals and retention by year | Reports from `membershipSummary`, by scheme | Later |
| MEM-52 | As a member I cancel inside the cooling-off period and am refunded without asking | A self-service refund up to the setting, through Payments | Later |
| MEM-54 | As a theatre we cap a scheme and keep a waiting list | A capacity on the scheme, enforced in the activation batch | Later |
| MEM-55 | As a publicity officer I write to all current members of a scheme | The source membership.scheme-holders on communications.audience-source, returning account ids only | Later |

## Cut order

If the first release has to shrink, stories leave in this order, last first: MEM-51, MEM-53, MEM-49, MEM-21, MEM-09, MEM-16, MEM-27, MEM-40, MEM-39, MEM-23, MEM-20. The gate, the email-domain verifier, renewal and online payment stay.
