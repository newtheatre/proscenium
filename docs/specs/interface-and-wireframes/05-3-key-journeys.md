# Key journeys

Ten journeys decide whether the interface works. The first five are box office, because that is the module that matters most; the rest prove the shells, the account model and setup. Each names the person, the shell, the device it is designed on, and what happens when it goes wrong.

The rules behind each step (prices, holds, eligibility, refunds) belong to the workstream that owns the module. This tab fixes only what the person sees and does.

| # | Journey | Person | Shell | Designed on | Wireframe |
| --- | --- | --- | --- | --- | --- |
| 1 | Buy a ticket | Audience member, not signed in | Public | Phone | W3 |
| 2 | Buy as a member | Member | Public | Phone | W3 |
| 3 | Sell at the desk | Box-office volunteer | Console | Laptop | W4 |
| 4 | Scan at the door | Front-of-house volunteer | Live | Phone | W5 |
| 5 | Refund or exchange | Box-office staff | Console | Laptop | W6 |
| 6 | Put a production on sale | Officer | Console | Laptop | W2, W6 |
| 7 | Join as a member | Existing customer | Public, then members' area | Phone | W7 |
| 8 | Work tonight | Member on shift | Members' area, then live | Phone | W7, W5 |
| 9 | Set the site up | Site owner | Setup, then console | Laptop | W8 |
| 10 | Change a policy number | Officer | Console | Laptop | W8 |

## 1. Buy a ticket

The target: from a production page to a confirmed ticket in under two minutes on a phone, without creating an account.

&#91;embedded content: Buying a ticket as a guest\]

1. **Production page.** Dates are listed with availability in words ("Good availability", "Last few", "Sold out"). One button: Book tickets.
2. **Choose a performance**, if there is more than one. Skipped when the visitor came from a specific date.
3. **Choose tickets.** General admission: a stepper per ticket type, with each price and who qualifies. Allocated seating: "Best available" is chosen for them, with "Choose my own seats" opening the plan. The running total is always visible.
4. **Basket.** The hold timer starts and is shown in the header in words ("Held for 9 minutes"). Optional extras the theatre has enabled appear here once: a donation, a programme.
5. **Your details.** Name and email. "Sign in for a faster checkout" is a quiet link, never a wall. Any questions the theatre attached to the ticket type come here.
6. **Pay.** The total is stated on the button ("Pay £24.00"). The provider's form sits inside the page.
7. **Confirmation.** The tickets, with their codes, on the page at once. They are also emailed. "Add to wallet" and "Add to calendar" where available. An offer to keep this order in an account, which is one tap because the email is already verified by the receipt link.

| If | The person sees |
| --- | --- |
| The chosen seats were taken a moment ago | "Those seats have just gone." The nearest alternative is offered; nothing else is lost |
| The hold is about to expire | A warning with one minute left and a button to extend, once |
| The hold expired | The basket is kept as a wish, the seats are released, and "Try again" re-holds if they are still free |
| Payment is declined | The provider's reason in plain words, the basket and hold intact, "Try another card" |
| The connection drops during payment | "We are checking whether your payment went through." Then a definite answer: paid, with tickets, or not paid, with the basket intact. Never "something went wrong" |
| The performance is sold out | A waiting-list form in place of the ticket stepper |
| The theatre takes no online payment | The same journey ends in "Reserve" with pay-at-the-desk instructions |

## 2. Buy as a member

The same seven steps and the same screens. Three things differ, and none of them is a switch the member operates.

- Member prices are already applied at step 3, with a line saying why ("Member price").
- Step 5 is pre-filled and collapsed to one line.
- The confirmation goes to the address the member chose for tickets, which may be a personal one.

Nothing in the journey mentions shifts, training or the members' area. The only member element on any screen is the account menu's "Members' area" entry.

## 3. Sell at the desk

The target: a walk-up sale in under 30 seconds, with a queue waiting.

1. **Desk screen** opens on tonight's performance, with the next performances one tap away. Sold, held and remaining are shown as numbers.
2. **Add tickets** with large steppers per type; keyboard shortcuts for the three most common types.
3. **Customer** is optional: search by name, email or order code, or leave blank for an anonymous sale. Finding a customer shows their entitlements (member price, and a promo code if they have one; passes come in a later release).
4. **Take payment:** card on the reader, cash or complimentary, in one payment that can also carry another module's lines such as bar items. The expected total is on screen in large figures; the reader's result comes back onto the screen.
5. **Done:** print, email or show a code. The screen resets for the next customer with one key.

| If | The person sees |
| --- | --- |
| The reader does not answer | The sale stays open as "Awaiting payment" with Check again, Cancel, or recording the reader's own result. "Take cash instead" appears only once the attempt is known to have failed, so nobody can pay twice |
| The reader's amount differs from the expected total | The sale is refused and both figures are shown |
| A customer collects a prepaid order | Search finds the order; the actions are Resend, Show or Admit (there is no collected state). A reserved order is paid at the desk first, and its code scanned at the door before then answers "Not paid. Send to the desk" |
| The seller is not allowed to issue a complimentary ticket | The option is shown with why, and "Request approval" |
| Someone else sells the last seat first | "Just sold. 0 left." The basket keeps the rest |

## 4. Scan at the door

The target: one ticket a second, with no signal.

1. **Tonight hub** shows a Door tile for whoever is on the door. Opening it loads tonight's ticket list onto the phone and says so ("312 tickets ready. Works offline").
2. **Scan.** The camera fills the top of the screen. Each scan answers with a full-width band: green tick "Admit 1", amber "Already scanned at 19:12 by Sam", red cross "Wrong night: Friday".
3. **The band carries what the door needs**: ticket type, seat, and a mark that an access note exists. The note's text is never on the band, because it is sensitive and the queue can see the screen; it opens on a deliberate tap.
4. **Search by name** is one tap away, for a customer with no code.
5. **The counter** shows admitted against sold. It is live across doors when connected, and marked "this phone only" when not.

| If | The person sees |
| --- | --- |
| There is no signal | "Offline. 14 scans waiting to send." Scanning carries on from the phone's copy |
| Two doors scan the same ticket while offline | Both admit. When they reconnect the second is flagged to the duty manager as a duplicate; nobody at the door is asked to resolve it |
| A ticket was refunded after the list was loaded | When online, refused. When offline, admitted and flagged on reconnect; the list's age is always shown |
| The camera is refused or broken | The screen opens on name search and a typed code |
| The phone sleeps or the tab closes | Reopening resumes with the queue intact |

## 5. Refund or exchange

1. **Find the order** from the command palette, the orders list or the customer's record.
2. **Order record:** what was bought, how it was paid, what has happened since. Primary action depends on state: Refund, Exchange, Resend tickets.
3. **Choose what to refund** by ticket, with the amount worked out and editable only where the rules allow.
4. **Reason**, from the theatre's list.
5. **Confirm:** the dialog states the amount, the method it returns by, and that the seats go back on sale.
6. **Outcome** on the record: refunded, or "Sent to the Treasurer for approval" with who and when.

| If | The person sees |
| --- | --- |
| The refund needs approval | The same form, ending in "Send for approval". The approver gets a card on their console home |
| The seller is refunding their own order | Refused, with who can do it instead |
| The provider refuses | The reason, and the order unchanged |
| An exchange costs more | The difference as a new payment step; less, as a part refund |

## 6. Put a production on sale

1. **New production** from the console: title, type, dates. A short form in a panel.
2. **Production record** opens with a checklist in its Overview: add performances, set prices, add a poster, publish the page, open sales.
3. **Performances** tab: add one or generate a run (every evening Wednesday to Saturday), each with space and capacity.
4. **Tickets** tab: choose a price list or set prices, with a preview of what a customer will see.
5. **Publish** makes the public page visible. **Open sales** is a separate, confirmed act with a time, so a page can be announced before booking opens.

Each checklist line links to its tab and ticks itself. The public page preview is one click from every step.

## 7. Join as a member

1. A signed-in customer follows "Get involved" on the public site to the theatre's joining form.
2. The form knows who they are and asks only what it does not have.
3. Any fee is paid in the same checkout the box office uses.
4. If the theatre verifies members, the page says what happens next and when.
5. Once entitled, "Members' area" appears in their account menu and a one-time welcome takes them there. Their ticket history is where it always was.

If they sign in with a second address the system already knows, it offers to link the two accounts, in workstream 2's words and on its screen.

## 8. Work tonight

1. **Members' home** shows the shift as its first card from the morning of the show.
2. From the shift's start, a bar across every page reads "You are on shift. Open Tonight".
3. **Tonight hub** shows the tiles this shift allows: Door, Checklist, Incident. A tile the person lacks training for is shown with why.
4. Each tile opens a live screen. Leaving returns to the hub.
5. After the night, the shift moves to their history with its hours.

## 9. Set the site up

1. **Setup screen** on a fresh deployment: apply the database, create the owner with a passkey.
2. **Five steps:** theatre name and type, time zone and currency, brand colour and logo with a live preview of all three shells, modules to switch on, sample data or a clean start.
3. **Console home** opens with a setup card per module switched on, each a short steps page that can be finished later.
4. A "Before you go live" checklist lists placeholder content not yet replaced and settings still at their defaults.

## 10. Change a policy number

1. Settings search for "refund" finds "Refund cut-off before a performance".
2. The setting shows its value, its default, and that two public pages quote it.
3. Saving states the change in words ("From 24 hours to 48 hours") and asks for confirmation because it is quoted publicly.
4. The public pages show the new number at once. The audit entry is linked from the setting.
