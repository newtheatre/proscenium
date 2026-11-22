# 9. Decisions

Nothing is waiting on a decision. Thirteen questions were put to Matt and all were answered on 16 November 2026. This part records each decision and why, and the rest of the specification is written to them.

| No. | Question | Decision | Where it is written |
| --- | --- | --- | --- |
| 1 | One module or two? | Two: `membership`, and `membership-fees` for money | Tabs 1, 2, 4, 6 |
| 2 | Supporters' schemes in the first release? | Yes. A scheme has a side | Rules S2, I3 |
| 3 | Which verifiers ship first? | By staff, by email domain, by uploaded list | Rules V1 to V7 |
| 4 | When is a fee counted as income? | In full on the day it is paid | Rule P6 |
| 5 | Is a member price judged when the ticket is bought, or on the night? | Both: when it is bought and again at entry | Tab 4, "Checking again at entry" |
| 6 | What happens the day a membership runs out? | The members' area goes at the next page load; no grace unless a scheme sets it | Rules D1 to D3; presets in tab 6 |
| 7 | Member numbers? | Yes, one per person for good, never reused | `membership_members` |
| 8 | May a member end their own membership? | A choice for each scheme, with no automatic refund | `holder_may_end`; tab 3, Ending |
| 9 | Who may take a fee at the desk? | Membership officers and box office staff, in a till session; waiving is separate and privileged | Rules P8, P9; tab 6 |
| 10 | Is the first-release list right? | Yes, with bulk import, custom fields about members, the scannable card and the desk sale with tickets added | Tab 7 |
| 11 | Bring the form builder's slots forward? | Yes: FB-501, FB-502, FB-503 (for the membership record) and FB-506 are in the first release | Tab 7, "What the stories rest on" |
| 12 | What does "1 year" mean at NNT, and can the union give a list? | A rolling 12 or 36 months from purchase; the union supplies a CSV of names, student IDs and end dates | Rules D8, D9; the student society preset |
| 13 | Accept a student ID in place of signing in, for the member price? | Yes, as a choice for each scheme, off unless turned on | Rules V8 to V19 |

## Changes after the interface review

Matt approved these on 21 November 2026, after the review of the staff screens. Each changes how a screen is arranged, not a rule.

| # | Change | Where |
| --- | --- | --- |
| 14 | Applications waiting on staff are a section of Members, not a screen and sidebar entry of their own. The count moves to Members | Tab 5, "Applications waiting" |
| 15 | One queue for a check and for approval. A check is passed or declined on its row; approval is still decided on the form's response, which its row opens, so the form's stages, reasons and conflict rules are not copied | Tab 5, "Applications waiting"; rule AP2 |
| 16 | New scheme asks for the name only. The key follows the name, and the draft starts as a members' scheme of rolling length | Tab 5, "A scheme"; `POST /api/membership/schemes` |
| 17 | Screens say "Members' scheme" and "Supporters' scheme", and the side is one switch, "Holders become members". "Side" stays a specification word | Tab 5, "A scheme" |
| 18 | Add member and Import are on Members only, not on a scheme's page in Admin | Tab 5, "A scheme" |
| 19 | The list key is made with the first verification list, so nobody has to type one. Its card folds away once a key is saved; a theatre may still replace it | Tab 5, "Verification lists"; rule V10 |
| 20 | Open scheme can always be pressed, and says what is missing by moving to the checklist | Tab 5, "A scheme"; rule S4 |
| 21 | A scheme's fees are a section of the scheme's own page. The fees module's prices page is gone and its address leads to Schemes | Tab 5, "A scheme" |

## Why, in brief

1. **Two modules.** Foundations rules that a dependency is hard or absent. One module that both kept the member list and took fees would make every theatre wanting a member list switch on Payments and Finance, even where members pay nothing or pay somebody else. NNT is that theatre: its students' union takes the fee.
2. **Sides.** Without a side, the first theatre that sells a "Friends" membership lets its audience into the members' area, which is the mistake this platform exists to prevent. A scheme's side cannot safely change later (rule S2), so it is there from the start.
3. **Verifiers.** A theatre can add its own as a module under `site/layers/`. Shipping another upstream waits until a second theatre wants the same one.
4. **Income when paid.** It matches how small societies keep their books and needs no schedule. Spreading a fee across its months can be added later as a setting without changing a table, because the charge records the membership's dates.
5. **Checked twice.** A theatre that reserves weeks ahead and takes payment on the night would otherwise honour a price for somebody who has since left. The second check is also what makes a typed reference safe to accept.
6. **No grace by default.** A scheme may set grace days. The amateur-company preset sets 30, because a month's grace is kinder than locking out a volunteer mid-production. Nothing on the audience side ever changes when a membership ends.
7. **Numbers.** A number is what staff read out and type at a desk, what a card shows, and where "member since" comes from. It also serves as a reference at the checkout (rule V8).
8. **Ending by the holder.** A students' union membership simply runs out or is renewed, and only the union can cancel it, so the student society preset turns this off. A refund is always asked of staff. A refund the member takes for themselves in the cooling-off period is a later story (MEM-52); the right period for a theatre is its own to check, and the setting defaults to 14 days.
9. **Fees at the desk.** Through Payments' desk basket, alone or with tickets in one payment.
10. **First release.** 49 stories of 58, nine of them the gate. The cut order is at the end of tab 7.
11. **Form builder stories.** Joining is built on the form builder: the application is a form in a slot, and custom fields about members are a record-mode form. The nine gate stories do not need them, because staff can add a member by hand and the member price works from that.
12. **NNT.** The committee checks a full name or a student ID on the union's website, which cannot be automated. So the application form asks for the name the union has and the student ID, and a committee member looks the person up and passes it (rule D10). Loading the union's file does the same job with nobody waiting. The union's file keeps its names, for staff only, to prevent misuse (rule V18). The fees module stays off for NNT; recording a fee taken elsewhere is not designed.
13. **A reference in place of signing in.** This is the general case of any theatre whose membership is run by somebody else: a students' union, a parent society, an employer's staff scheme. Its weakness is stated in rule V16: a student ID is not a secret. The field appears only inside the member ticket type and is worded in full, so that a student of another university, or somebody buying a concession ticket, is never asked for a student ID (rules V12 and V13). One reference meets one ticket, so booking for a friend who is also a member means typing the friend's (rule V14).

## Wording

"Member" already means anyone with a standing, in Identity. So in specifications somebody who holds a scheme is a **membership holder**, a fixed-date scheme runs for a **scheme year**, and one membership runs for a **membership period**. On screens people still read "member".
