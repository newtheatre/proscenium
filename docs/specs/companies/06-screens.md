# 5. Screens

Companies has 14 screens: 10 in the console, 3 for contacts under My account, and one section on Festival's venue-day sheet. They follow Interface's page conventions: List pages with archived rows below a collapsible divider and search by New, right-click menus on rows, record pages with tabs, inline Nuxt UI validation, toasts with Undo, primary buttons in the default colour.

## Inventory

| Screen | Address | Who sees it | Holds | Release |
| --- | --- | --- | --- | --- |
| Companies | `/console/companies` | `company.view` | List: name, kinds of engagement seen, live engagements, primary contact, last date. Filters: kind, has live engagement, archived | First |
| Company | `/console/companies/<id>` | `company.view` | Tabs: Details, Contacts, Engagements, History; tabs from others (Sponsorships, Loans). Actions: Edit, Merge, Archive | First |
| New company | modal from Companies | `company.manage` | Name, then "Private person hiring" switch; near-match warning (G1) | First |
| Merge companies | modal | `company.merge` | Pick the survivor, preview what moves, confirm (G5) | First |
| Engagements | `/console/companies/engagements` | `engagement.view` | List by state, kind, season; badges: "Agreement unanswered", "Guests due", "Settle by 4 Dec" | First |
| Engagement | `/console/companies/engagements/<id>` | `engagement.view` | Tabs: Overview, Agreement, Calls and people, Guests, Settlement, History, plus contributed panels | First |
| Agreement editor | Agreement tab | `agreement.manage` | Deal type, then only its fields; guest places; deadlines; clauses; file; Send | First |
| Settlement | Settlement tab | `settlement.view` | Figures from Finance, lines, balance, state, actions by ability | First |
| Settlements | `/console/companies/settlements` | `settlement.view` | To prepare, proposed, queried, to approve, approved awaiting payment, paid | First |
| Company tab on a production | core production page | `engagement.view` | The company, contact, state; "Link a company" or "Open engagement" | First |
| Your companies | `/account/companies` | The fact | Each engagement as a card: dates, what needs doing ("Name 2 guests by Thu 14:00") | First |
| Your engagement | `/account/companies/<engagement>` | The fact | Phone-first page, below | First |
| Settlement statement | `/account/companies/<engagement>/settlement` | The fact | The proposed figures, Agree or Ask a question | First |
| Calls section | Festival's venue-day sheet | `engagement.view` | Get-ins and get-outs in that space that day; day-of contact | With Festival |

Settings sit on the module's page under Admin > Modules, reached from the Companies list's cog (part 6).

## Your engagement (contact, phone)

The page a touring company manager opens on the way in. Everything they need without signing into the console, and every action they owe at the top.

_[Diagram: wireframe · your engagement, phone]_

- **To do** lists only what the contact owes, oldest deadline first, each opening its own sheet: name guests, answer an agreement, add people, agree a settlement. Empty, it reads "Nothing to do".
- **Dates** merges performances (from core), calls and hire bookings in time order, in the theatre's time zone, with "Add to calendar".
- **Sales** appears only where the theatre mapped `box-office.report.view` to the fact, and reads figures through core's `readMeasure`.
- Contributed panels (Festival, Productions) follow in their declared order.

## Naming guests (contact, sheet)

_[Diagram: wireframe · naming guests sheet, phone]_

Adding issues the tickets at once (L2) and the guest gets Box office's usual email. After the deadline the sheet is read only and says what happened to unnamed places (L5).

## Engagement (staff, desktop)

_[Diagram: wireframe · staff engagement page, desktop]_

The Agreement tab shows versions newest first, each with its state and who answered; a draft shows the editor. The deal type dropdown shows only that type's fields: a split asks for the share and whether booking fees come off first; a hire asks for the fee, its basis and the deposit.

## Settlement (staff, desktop)

_[Diagram: wireframe · settlement tab, desktop]_

The figures are illustrations, not policy. The Approve button sends the balance it shows; a mismatch refuses, quoting both (M5). After approval the tab shows where the money stands: the invoice or bill with its state when Invoices is on, or payments recorded and "Record a payment" when it is off.
