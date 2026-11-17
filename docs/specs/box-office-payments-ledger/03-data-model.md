# 2. Data model

## How to read this part

Three modules, 38 tables: 22 for Box office, 9 for Payments and 7 for Finance. Names follow the Foundations format: the module id in snake\_case, then a plural noun. The column tables use the Foundations layout (column, type, constraints, class, on erasure), and the section "Each table in the Foundations format" below gives the wording map and every table's heading line.

**Conventions on every table, not repeated in each:**

- `id` is `col.id()`: the table's prefix, an underscore and 26 characters. Primary key, class Internal.
- `created_at` and `updated_at` are UTC integers (milliseconds), class Internal. Append-only tables have no `updated_at`.
- Money is an integer in minor units with a three-letter currency code beside it. There is no floating point anywhere.
- A column that names an account (`account_id`, `sold_by`, `approved_by` and the like) is `col.account`, a reference to `core.account`. Its class is Personal in every table, whether the account is the row's subject or an actor. On erasure the reference is **kept**: the core anonymises the account it points to, so the row still says "someone sold this" without saying who.
- A nullable account column that is a row's subject declares `unlinked`, as Foundations requires (integration ruling R-15). Only `box_office_orders.account_id` is one.
- A value that grants access (a ticket code, a pass code, a desk code, a link or offer token) is stored only as a hash.
- A reference to another module's record (a performance, a production, a space) is by id only. No module here reads another module's tables.

**Data classes:** Public, Internal, Personal, Personal free text, Special category (encrypted). **Erasure behaviours:** keep (not personal), keep reference (see above), blank (set to null), delete row.

**Kinds of table:**

| Mark | Meaning | Enforced by |
| --- | --- | --- |
| Append-only | Rows are never updated or deleted; a correction is a new row | Triggers refusing UPDATE and DELETE |
| Guarded | Updates are allowed only along the life cycle in part 3 | Triggers and CHECKs named in the table |
| Plain | Ordinary editable data | Abilities only |

## Each table in the Foundations format

**Words.** Where a column table below says "blank", read `clear` for a personal column and `redact` for personal free text. Where it says "keep reference", the column is `col.account(name, { role: 'actor' })`; the subject columns named in the table below use `role: 'subject'`. Money columns are `col.minor` and `col.currency`. Encrypted columns are `col.special`.

**Account merge** (integration ruling R-34). Every account column in these three modules is `onMerge: 'alias'`, the default: the row keeps the id it was written with, which resolves to the surviving account. That covers every actor column and the subject columns `box_office_orders.account_id`, `box_office_passes.account_id`, `box_office_comp_requests.for_account_id` and `box_office_tickets.requirement_account_id`. One column is `move`: `payments_sessions.opened_by`, because the unique index that allows one open till session per person compares stored ids and would otherwise let a merged person hold two.

Since a person may now be several stored ids, everything that reads, counts or limits by account uses the kit's account scope (the survivor and its aliases), as Foundations names it (Data-class registry, "The account scope"). A statement uses `inAccountScope(column, accountId)` as its condition, or `accountScope(accountId)` as a subquery, so the scope is resolved inside the statement and never bound as a list. `accountScopeIds` is for display and tests only. No statement in these modules compares an account column to an id directly; the conformance check refuses it, and `exactAccount` is used once, with its reason, for the open-session index above. The scope is used for:

- "My tickets", `ticketsFor(accountId)`, the audience sources and the erasure hold.
- `max_per_holder` on its account key, the reservation limit per person, and any promo code limit per person, each as the condition on its claim statement.
- The rules that nobody approves their own refund or complimentary request, and nobody overrides for their own ticket. The service compares resolved accounts; the CHECKs compare stored ids and stay as backstops.

| Table | Realm | Subject | Append-only | Retention and row erasure |
| --- | --- | --- | --- | --- |
| `box_office_performance_sales`, `_bands`, `_ticket_types`, `_pools`, `_promo_codes`, `_pass_types` | operational | none | no | kept |
| `box_office_prices` | operational | none | yes | kept |
| `box_office_orders` | audience | `account_id`, `unlinked: 'staff'` | no | keep-row; the access note is cleared with the account |
| `box_office_order_lines`, `_promo_redemptions` | audience | via `order_id` | no | with the order |
| `box_office_tickets` | audience | via `order_line_id` | no | with the order |
| `box_office_holds` | audience | via `order_id`; none for a staff hold | no | `box-office.retention.holds` redacts a staff hold's label |
| `box_office_claims` | audience | via `hold_id` | no (guarded) | kept |
| `box_office_cancellations` | audience | via `order_id` | yes; `note` is erasable | with the order |
| `box_office_scans` | operational | none | yes | kept |
| `box_office_passes` | audience | `account_id` | no | keep-row |
| `box_office_pass_redemptions` | audience | via `pass_id` | no | kept |
| `box_office_comp_requests` | operational | `for_account_id` | no | keep-row |
| `box_office_waitlist_entries` | audience | email: `contact_email` | no | delete-row; also deleted `box-office.retention.waiting-list` after the performance |
| `box_office_seating_plans`, `_plan_seats`, `_performance_seats` | operational | none | no (guarded) | kept |
| `payments_provider_accounts`, `_readers` | operational | none | no | kept |
| `payments_sessions` | operational | `opened_by` | no | `variance_note` redacted |
| `payments_intents`, `_intent_parts`, `_attempts`, `_refunds` | operational | none | no (guarded) | kept |
| `payments_attempt_events` | operational | none | yes | kept |
| `payments_webhook_events` | operational | none | no | `payments.retention.webhooks`; rows deleted by the task `payments.prune-webhooks` |
| `finance_accounts`, `_periods`, `_tax_codes` | operational | none | no | kept |
| `finance_postings`, `_entries`, `_seals`, `_period_closes` | operational | none | yes | kept for ever |

**People with no sign-in.** Workstream 2 ruled on 16 November that the account is the person and a sign-in is optional. At checkout and at the desk the box office calls identity's `findOrCreateAccount(address, name, origin)`, which returns an account id, creating an unclaimed account when no account has verified that address. Orders, passes and complimentary requests are therefore keyed to an account and **store no name, email or phone of their own**. A guest who later signs in with that address finds their history already there, and erasure and "download my data" work through the ordinary account screens. Only a waiting-list entry, which is nothing but an address, uses the Foundations email subject. An anonymous walk-up sale at the desk has no account at all.

**Two words to read with care** (integration ruling, 16 November). Identity also uses "hold" and "claim". Across modules, the box office's are the **seat hold** (seats kept for a basket or by staff; Identity's is the erasure hold) and the **capacity claim** (one unit of capacity or one seat taken; Identity's claim is claiming an account). Inside this specification the bare words mean these. Table and column names are unchanged.

## Id prefixes

Foundations amended the id format on 16 November: every id is `<prefix>_<26 characters>`, the prefix declared per table as `defineTable(name, columns, { id: 'ord' })`. `col.ref(table)` and route inputs accept only that table's prefix, so an order id can never be passed where a ticket id is wanted. Ids sort by creation time. No table here declares `random: true`, because no row id acts as a secret: a ticket's scan code, an order's link token and a waiting-list offer token are separate random values stored as hashes. The short booking reference a person reads out is a separate field on the order. Foundations checked the list below for clashes across the system and entered it in its id prefix index (part 4 of the Foundations specification).

| Table | Prefix | Table | Prefix |
| --- | --- | --- | --- |
| `box_office_performance_sales` | `sale` | `box_office_seating_plans` | `plan` |
| `box_office_bands` | `band` | `box_office_plan_seats` | `pls` |
| `box_office_ticket_types` | `tty` | `box_office_performance_seats` | `pfs` |
| `box_office_prices` | `prc` | `payments_provider_accounts` | `ppa` |
| `box_office_pools` | `pool` | `payments_readers` | `rdr` |
| `box_office_holds` | `hold` | `payments_sessions` | `till` |
| `box_office_claims` | `clm` | `payments_intents` | `pay` |
| `box_office_orders` | `ord` | `payments_attempts` | `att` |
| `box_office_order_lines` | `orl` | `payments_attempt_events` | `ate` |
| `box_office_tickets` | `tkt` | `payments_refunds` | `rfd` |
| `box_office_scans` | `scan` | `payments_webhook_events` | `pwe` |
| `box_office_cancellations` | `can` | `finance_accounts` | `lac` |
| `box_office_promo_codes` | `prm` | `finance_postings` | `post` |
| `box_office_promo_redemptions` | `prr` | `finance_entries` | `led` |
| `box_office_pass_types` | `pty` | `finance_seals` | `seal` |
| `box_office_passes` | `pass` | `finance_periods` | `fpe` |
| `box_office_pass_redemptions` | `psr` | `finance_period_closes` | `pcl` |
| `box_office_comp_requests` | `comp` | `finance_tax_codes` | `tax` |
| `box_office_waitlist_entries` | `wle` |  |  |

`payments_intent_parts` has the prefix `pip`. With it, the list above is the final table list for the three modules.

## Box office: what is on sale

### `box_office_performance_sales` (plain)

One row per performance the box office sells. It is the box office's own view of a performance; the performance itself belongs to the core, whose states are draft, scheduled, cancelled and completed. **Sale state lives here, not in the core** (agreed with workstream 3). A performance ticketed elsewhere has no row here at all: the core keeps its external booking link and shows it when no module contributes a booking action.

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| `performance_id` | text | unique, not null; `core.performance` | Public | keep |
| `seating` | text | `general` or `allocated` | Public | keep |
| `plan_id` | text | `box_office_seating_plans`; required when seating is `allocated` | Internal | keep |
| `state` | text | `draft`, `on_sale`, `paused`, `closed` | Public | keep |
| `on_sale_at` | integer | null means not scheduled | Public | keep |
| `off_sale_at` | integer | null means the setting's default before curtain | Public | keep |
| `max_per_order` | integer | null means the setting; CHECK > 0 | Public | keep |
| `hold_minutes` | integer | null means the setting; CHECK > 0 | Internal | keep |
| `payment_timing` | text | `pay-now`, `reserve`, `buyer-chooses`; null means the setting | Public | keep |
| `change_decision` | text | null, `refund_all`, `offer_exchange` or `keep`: what happens to tickets when the core cancels, reschedules or moves this performance (part 3) | Internal | keep |
| `change_decided_by`, `change_decided_at` | account (actor), integer | set with `change_decision` | Personal | keep reference |

The time doors open is the core's `doors_at`, read through the performance service whenever scanning needs it. No copy is kept here, so a rescheduled performance cannot leave a stale one.

Lists a theatre edits are the core's vocabularies, declared in each module's manifest (part 6): complimentary reasons, cancellation reasons, door reasons, refund decline reasons and period reopen reasons. A column that takes its value from one stores a `core_terms` id and is named `..._term_id`. Lists that drive behaviour (a ticket type's `kind`, every `state`) are fixed in code and are not vocabularies.

### `box_office_bands` (plain)

A priced part of the house for one production: "Stalls", "Balcony", "Wheelchair spaces".

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| `production_id` | text | not null; `core.production` | Public | keep |
| `name` | text | not null; unique per production | Public | keep |
| `kind` | text | `standard`, `wheelchair`, `restricted_view` | Public | keep |
| `displaces_band_id` | ref `box_office_bands` | `wheelchair` bands only. Null means permanent wheelchair spaces that take no seats. Set, it names the seating band whose seats are removed to make each space | Internal | keep |
| `displaces_units` | integer | default 2, CHECK >= 1; how many seats one wheelchair space removes. Only meaningful with `displaces_band_id` | Internal | keep |
| `sort` | integer | not null | Internal | keep |

### `box_office_ticket_types` (plain)

Who a ticket is for: "Full price", "Concession", "Companion". Site-wide, so reports compare like with like across productions.

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| `name` | text | unique, not null | Public | keep |
| `kind` | text | `standard`, `concession`, `companion`, `complimentary`; fixed, because each changes behaviour | Public | keep |
| `requirement_refs` | text | null, or a list of plain-text requirement references such as `membership:<scheme id>` or `fact:<name>`, checked through the kit's `requirements.check` (part 4). Box office never reads inside one and holds no foreign key | Internal | keep |
| `recheck_at_entry` | integer | boolean, default true; only meaningful with `requirement_refs` | Internal | keep |
| `max_per_holder` | integer | default 1; live tickets of this type per performance for one holder, counted on both keys: by account, on the kit's account scope, whenever the ticket keeps one, and by evidence id whenever it keeps one, so a claim is refused when either matches; only meaningful with `requirement_refs` | Internal | keep |
| `proof_note` | text | shown to the buyer and the door, such as "Bring student ID" | Public | keep |
| `needs_paid_ticket` | integer | boolean; a companion ticket needs a paid ticket in the same order | Internal | keep |
| `active` | integer | boolean | Internal | keep |
| `managed_by` | text | null, or `<module>.<id>` for a type a module declares through `box-office.ticket-type` (part 5); unique when set. Its kind, requirements, `needs_paid_ticket`, `max_per_holder` and `recheck_at_entry` follow the declaration. Companion and complimentary types exist only this way | Internal | keep |
| `sort` | integer | default 0; the order every list shows types in, the name breaking a tie. Set by dragging rows on the Ticket types screen, saved whole through `PUT /api/box-office/ticket-types/order`; a new type goes last | Internal | keep |

### `box_office_prices` (append-only)

The price of one ticket type in one band. A price change is a new row; at the moment of sale a row for the performance itself outranks a row for the whole production, however new that one is, and among rows equally specific the newest wins. An order line copies the amount, so an old order never changes.

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| `production_id` | text | not null | Public | keep |
| `performance_id` | text | null means every performance of the production | Public | keep |
| `band_id` | text | not null | Public | keep |
| `ticket_type_id` | text | not null | Public | keep |
| `amount_minor` | integer | CHECK >= 0; null withdraws the price | Public | keep |
| `currency` | text | not null | Public | keep |
| `effective_from` | integer | not null | Internal | keep |
| `set_by` | text | account | Personal | keep reference |

## Box office: capacity

Proved in the Proof tab. These three tables are the last-seat guarantee.

### `box_office_pools` (guarded)

The capacity of one band at one performance.

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| `performance_id` | text | not null | Public | keep |
| `band_id` | text | not null; unique with `performance_id` | Public | keep |
| `capacity` | integer | CHECK >= 0 | Internal | keep |
| `claimed` | integer | default 0; **CHECK (claimed >= 0 AND claimed <= capacity)**; written only by triggers | Internal | keep |
| `over_venue_confirmed_by` | text | account; set when capacity is raised above the space's own capacity | Personal | keep reference |

### `box_office_holds` (guarded)

Why a group of claims exists and who owns it.

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| `kind` | text | `basket`, `payment`, `reservation`, `staff`, `waitlist_offer` | Internal | keep |
| `order_id` | text | null for a staff hold | Internal | keep |
| `label` | text | staff holds only, such as "Director's guests"; max 80 | Personal free text | blank |
| `held_by` | text | account; staff holds only | Personal | keep reference |

### `box_office_claims` (guarded)

One unit of capacity, or one seat. The truth about what is sold.

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| `pool_id` | text | not null | Internal | keep |
| `seat_id` | text | null for general admission; `box_office_performance_seats` | Internal | keep |
| `hold_id` | text | not null | Internal | keep |
| `displaced_for_id` | ref `box_office_claims` | null for an ordinary claim. Set on a claim that exists only because a wheelchair space removed this seat: it names the wheelchair space's claim, carries no ticket, and is released in the same statement as that claim | Internal | keep |
| `state` | text | `held`, `confirmed`, `released` | Internal | keep |
| `expires_at` | integer | null once confirmed, and for staff holds with no end | Internal | keep |
| `released_at` | integer | set with `released` | Internal | keep |
| `release_reason` | text | `expired`, `abandoned`, `cancelled`, `exchanged`, `staff`, `payment_failed` | Internal | keep |

Enforced in the database:

- Unique index on `(pool_id, seat_id)` where `seat_id` is not null and `state` is `held` or `confirmed`: a seat has one live claim.
- Trigger after insert of a live claim: `claimed + 1` on the pool. Trigger after a change to `released`: `claimed - 1`.
- Trigger: `released` is final. Trigger: a claim is never deleted. Trigger: `pool_id` and `seat_id` never change.

## Box office: orders and tickets

### `box_office_orders` (guarded)

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| `reference` | text | unique; short, readable, no ambiguous characters | Internal | keep |
| `channel` | text | `online`, `desk`, `phone` | Internal | keep |
| `state` | text | `basket`, `reserved`, `awaiting_payment`, `confirmed`, `cancelled`, `expired` | Internal | keep |
| `account_id` | account (subject) | required to confirm or reserve an online or phone order; null for a basket not yet checked out and for an anonymous desk sale. Declared `unlinked: 'staff'` | Personal | keep reference |
| `signed_in` | boolean | false when the order was made without signing in | Internal | keep |
| `access_note` | text, encrypted | optional; a list of `{ term, note? }` whose terms come from the core vocabulary `core.access-need`, as the buyer gave them for this booking (part 4, "Access needs"). Never set on an order with no account | Special category | clear |
| `currency` | currency | not null | Internal | keep |
| `total_minor` | minor units | at least 0; the sum of live lines, rewritten in the same batch as any line change | Internal | keep |
| `sold_by` | account (actor) | desk and phone orders | Personal | keep reference |
| `session_id` | ref `payments_sessions` | desk orders | Internal | keep |
| `intent_id` | ref `payments_intents` | the intent whose part pays for this order; null for a free order and for a reservation not yet being paid | Internal | keep |
| `link_token_hash` | text | opens the order from the confirmation message without signing in | Internal | clear |
| `desk_code_hash` | text | reserved orders: the code a buyer shows at the desk | Internal | clear |
| link\_token\_expires\_at | timestamp | when the order's link stops working; every link token has an expiry on the row it opens (Foundations part 4, rules T1 to T4) | Internal | keep |
| confirm\_token\_hash | text | a basket waiting for its buyer to confirm their email: the hash of the link token sent to them. Cleared when the link is used | Internal | clear |
| confirm\_expires\_at | timestamp | when that token stops working; never later than the basket's own expiry | Internal | keep |
| confirm\_email | text | the address being confirmed, since no account exists yet. Cleared in the batch that reserves the order or expires the basket | Personal | clear |
| confirm\_name | text | the name that buyer typed, so the account made when the link is pressed has a name and the desk can find the reservation by it. Cleared with the address | Personal | clear |
| basket\_token\_hash | text | the token the buyer's own browser was given when it first held tickets. Separate from link\_token\_hash, which is only ever the link in a message, because both can be live at once | Internal | clear |
| `expires_at` | timestamp | baskets and orders awaiting payment | Internal | keep |
| `extended_at` | timestamp | set by the one hold extension; null until then | Internal | keep |
| `release_at` | timestamp | reserved orders: when the release task may expire it; null for never | Internal | keep |
| `keep` | boolean | reserved orders: staff asked for it not to be released | Internal | keep |
| admit\_on\_payment | boolean | desk orders: the seller chose Pay and admit, so the settle batch issues the tickets already admitted, with a scan row each | Internal | keep |
| reserved\_at | timestamp | when the order was reserved; null for an order never reserved. A later change of ticket type is priced as of this moment | Internal | keep |
| `confirmed_at`, `cancelled_at` | timestamp |  | Internal | keep |

The buyer's name, email and phone live on their account (workstream 2), not here. The one exception is the name and address of a buyer who is not signed in and has yet to confirm their email, which a basket holds until the link is pressed or the basket expires. A trigger keeps the four confirm columns to a basket, all set or all null, ending no later than the basket; whatever reserves, edits or expires the basket clears them. An erased buyer's order keeps its lines, tickets and ledger postings; the account it points to is anonymised, and the order loses its access note and its email link.

**An order with no account** is valid in exactly one case: a desk sale where the buyer gave no details (integration ruling R-15). The table declares `subject: { account: 'account_id', unlinked: 'staff' }`, and Identity lists it under "People without a sign-in". Such an order holds no personal data, so it has no erasure or merge duties, and it can have no access note. The online and phone paths can never create one, and an order can never be `reserved` without an account, because someone must be told and found again. Enforced by `CHECK (account_id IS NOT NULL OR state IN ('basket', 'expired') OR (channel = 'desk' AND access_note IS NULL AND state <> 'reserved'))`, and by the never-regress cases `online-order-always-has-an-account` and `reservation-needs-an-account` in part 8.

**What retention does.** An order keeps no name, email or phone, so `box-office.retention.orders` governs only what the order itself holds: when it passes, the access note, the link and desk code hashes, and its tickets' stored codes and any attendee names on them, are cleared, and the rows stay for the ledger. `box-office.retention.baskets` deletes expired baskets that never became orders. Unclaimed accounts are anonymised by Identity under its own setting.

**Checkout consent.** The order stores nothing about consent. The module that contributes a consent question also supplies the statements that record the answer, and Box office adds them to the batch that confirms or reserves the order (part 4).

### `box_office_order_lines` (guarded)

One line per ticket, never a quantity, so each ticket can be refunded, exchanged and scanned on its own.

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| `order_id` | text | not null | Internal | keep |
| `kind` | text | `ticket`, `booking_fee`, `donation`, `pass_sale`, `exchange_fee`, `adjustment` | Internal | keep |
| `performance_id`, `band_id`, `ticket_type_id` | text | required when kind is `ticket` | Internal | keep |
| `claim_id` | text | unique; required when kind is `ticket` | Internal | keep |
| `list_minor` | integer | CHECK >= 0; the price copied at the moment it was added | Internal | keep |
| `discount_minor` | integer | CHECK between 0 and `list_minor` | Internal | keep |
| `amount_minor` | integer | CHECK = `list_minor - discount_minor` | Internal | keep |
| `promo_redemption_id` | text | at most one of this and the next | Internal | keep |
| `pass_redemption_id` | text |  | Internal | keep |
| `comp_request_id` | text | required when the ticket type is complimentary | Internal | keep |
| `requirement_ref`, `requirement_account_id`, `requirement_evidence_id` | text | what a line with requirements met and who met it, copied onto its ticket when issued; the holder limit counts live lines by these | Internal | keep |
| `state` | text | `live`, `cancelled`, `exchanged` | Internal | keep |
| `replaces_line_id` | text | set on the new line of an exchange | Internal | keep |

### `box_office_tickets` (guarded)

Issued when the order is confirmed. One per ticket line.

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| `order_line_id` | text | unique, not null | Internal | keep |
| `performance_id` | text | not null; copied, so the door reads one table | Internal | keep |
| `code_hash` | text | unique; the hash of the ticket's code, which is 128 random bits. The code goes to the buyer inside a signed door code and is never stored in the clear. A scan is verified, hashed, then looked up here | Internal | keep |
| code\_enc | text, encrypted | nullable. The same code, declared col.internal with encrypted: true and erase: 'clear' (Foundations, Data-class registry, "A kept credential"), kept only so the ticket can be shown or sent again without voiding the one the buyer already has: the door code is rebuilt by signing it afresh. Never read by a scan, never in the offline data, an event, a log or an export. Cleared when the ticket is voided and when box-office.retention.orders passes | Internal | clear |
| `key_id` | text | the kit signing key that signed the door code, under the purpose `box-office.door-code` | Internal | keep |
| `state` | text | `valid`, `void` | Internal | keep |
| `void_reason` | text | `cancelled`, `exchanged`, `reissued`, `performance_cancelled` | Internal | keep |
| `attendee_name` | text | optional, for named tickets | Personal | blank |
| `admitted_at` | integer | null until admitted; set by a conditional update `WHERE admitted_at IS NULL AND state = 'valid'` | Internal | keep |
| admitted\_scan\_id | ref box\_office\_scans | nullable; the scan that admitted the ticket, set by the same conditional update as admitted\_at. The scan row's result is taken from it: admitted when it is that scan's id, otherwise already admitted (Foundations part 3: a later statement never learns who won from a count of changed rows). Undoing a mis-scan clears both columns in one statement | Internal | keep |
| `requirement_ref` | text | the requirement reference that was met; null for a ticket type with none | Internal | keep |
| `requirement_account_id` | account (actor) | the account the requirement was met by, when it was met by account | Personal | keep reference |
| `requirement_evidence_id` | text | the opaque evidence id the source returned. At least one of this and the account is set when `requirement_ref` is. The value a buyer presented is never stored | Internal | keep |

### `box_office_scans` (append-only)

Every scan, including refusals and scans made offline. The audit trail of the door.

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| `id` | text | made on the device in the standard form, `scan_` and 26 characters, so a scan sent twice is stored once | Internal | keep |
| `ticket_id` | text | null when the code was unknown | Internal | keep |
| `performance_id` | text | the performance the scanner was set to | Internal | keep |
| `result` | text | `admitted`, `admitted_by_override` ("Admit anyway" after a requirement was not met; the person who allowed it is `scanned_by`), `already_admitted`, `void`, `wrong_performance`, `requirement_not_met`, `unknown`, `bad_signature`, `reversed` | Internal | keep |
| `reason_term_id` | ref `core_terms` | required for `reversed` and for `admitted_by_override`; from the door reasons | Internal | keep |
| `unchecked` | integer | boolean; admitted without the requirement check being made (source unavailable, or offline) | Internal | keep |
| `scanned_by` | text | account | Personal | keep reference |
| `device_label` | text | such as "Door 2" | Internal | keep |
| `scanned_at` | integer | the device's clock | Internal | keep |
| `received_at` | integer | the server's clock; differs for offline scans | Internal | keep |
| `offline` | integer | boolean | Internal | keep |

### `box_office_cancellations` (append-only)

One row each time lines of an order are cancelled or exchanged.

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| `order_id` | text | not null | Internal | keep |
| `kind` | text | `customer`, `staff`, `performance_cancelled`, `exchange`, `unfulfilled_payment` | Internal | keep |
| `reason_term_id` | ref `core_terms` | from the cancellation reasons the theatre edits (illness, cannot attend, booked in error, other) | Internal | keep |
| `note` | text | optional; max 200 | Personal free text | blank |
| `line_ids` | text | JSON array of order line ids | Internal | keep |
| `refund_id` | text | `payments_refunds`; null when nothing was refunded | Internal | keep |
| `fee_minor` | integer | the cancellation or exchange fee kept | Internal | keep |
| `by` | text | account; null when the customer did it from the email link without signing in | Personal | keep reference |

`note` is the one append-only column that erasure blanks; the trigger allows exactly that update and no other.

## Box office: discounts, passes and complimentary tickets

### `box_office_promo_codes` (guarded)

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| `code` | text | unique, stored upper-case | Internal | keep |
| `effect` | text | `percent_off`, `amount_off`, `set_price`, `unlock` | Internal | keep |
| `value` | integer | basis points or minor units by effect; CHECK >= 0 | Internal | keep |
| `production_id`, `performance_id`, `ticket_type_id`, `band_id` | text | each null means any | Internal | keep |
| `max_uses` | integer | null means unlimited | Internal | keep |
| `used` | integer | default 0; **CHECK (used >= 0 AND (max\_uses IS NULL OR used <= max\_uses))**; trigger-kept | Internal | keep |
| `max_per_order` | integer | null means the order cap | Internal | keep |
| `valid_from`, `valid_until` | integer |  | Internal | keep |
| `active` | integer | boolean | Internal | keep |

`unlock` reveals a hidden ticket type or an early on-sale window without changing the price.

### `box_office_promo_redemptions` (guarded)

One row per ticket a code was used on. Same pattern as claims: inserting a live row adds to `used`, releasing subtracts, so the last use of a code is given once.

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| `promo_code_id` | text | not null | Internal | keep |
| `order_id` | text | not null | Internal | keep |
| `state` | text | `live`, `released` | Internal | keep |

### `box_office_pass_types` (plain)

A season ticket or a multi-show pass as a product.

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| `name` | text | unique | Public | keep |
| `uses` | integer | tickets it can be exchanged for; null means one per production in scope | Public | keep |
| `price_minor`, `currency` | integer, text | CHECK >= 0 | Public | keep |
| `season_id` | text | `core.season`; null means any | Public | keep |
| `ticket_type_id` | text | the type of ticket it issues | Internal | keep |
| `valid_from`, `valid_until` | integer |  | Public | keep |
| `on_sale` | integer | boolean | Public | keep |

### `box_office_passes` (guarded)

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| `pass_type_id` | ref | not null | Internal | keep |
| `order_line_id` | ref | the line that sold it; null when issued by staff | Internal | keep |
| `account_id` | account (subject) | not null; the holder | Personal | keep reference |
| `code_hash` | text | unique; the hash of the pass's code, stored like a ticket's, with a nullable code\_enc column beside it declared and used exactly as the ticket's is | Internal | keep |
| `uses_total` | integer | null means unlimited within scope | Internal | keep |
| `uses_taken` | integer | **CHECK (uses\_taken >= 0 AND (uses\_total IS NULL OR uses\_taken <= uses\_total))**; trigger-kept | Internal | keep |
| `state` | text | `active`, `void`, `expired` | Internal | keep |

### `box_office_pass_redemptions` (guarded)

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| `pass_id` | text | not null | Internal | keep |
| `production_id` | text | unique with `pass_id` among live rows when the pass is one per production | Internal | keep |
| `state` | text | `live`, `released` | Internal | keep |

### `box_office_comp_requests` (guarded)

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| `performance_id`, `band_id` | ref | not null | Internal | keep |
| `quantity` | integer | CHECK > 0 | Internal | keep |
| `for_account_id` | account (subject) | who the tickets are for; an unclaimed account with origin `named-by-other` when the requester names someone new, who then receives service messages only | Personal | keep reference |
| `reason_term_id` | ref `core_terms` | from the complimentary reasons the theatre edits (cast, crew, press, reviewer, sponsor, other) | Internal | keep |
| `requested_by` | account (actor) |  | Personal | keep reference |
| `state` | text | `requested`, `approved`, `declined`, `issued`, `withdrawn` | Internal | keep |
| `decided_by` | account (actor) | **CHECK (decided\_by IS NULL OR decided\_by <> requested\_by)** | Personal | keep reference |
| `order_id` | ref | set when issued | Internal | keep |

## Box office: waiting list

### `box_office_waitlist_entries` (guarded)

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| `performance_id` | ref | not null | Internal | keep |
| `band_id` | ref | null means any band | Internal | keep |
| `party_size` | integer | CHECK > 0 and within the order cap | Internal | keep |
| `contact_email` | email | not null; stored trimmed and lower-cased; the row's subject | Personal | delete row |
| `state` | text | `waiting`, `offered`, `accepted`, `lapsed`, `left`, `closed` | Internal | keep |
| `offer_hold_id` | ref | the hold that keeps the seats while the offer is open | Internal | keep |
| `offer_token_hash` | text | opens the offer from its email | Internal | clear |
| `offer_expires_at` | timestamp |  | Internal | keep |
| `joined_at` | timestamp | the order of the queue | Internal | keep |

A waiting-list entry is only an address and a party size, so it creates no account. It has no financial meaning, so erasure deletes the row outright. Accepting an offer goes through the ordinary checkout, which is where an account is found or created.

## Box office: seating plans (designed now, built in the allocated-seating phase)

### `box_office_seating_plans` (guarded)

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| `space_id` | text | `core.space` | Public | keep |
| `name` | text |  | Public | keep |
| `state` | text | `draft`, `published`, `retired`; a published plan's seats are frozen by trigger | Internal | keep |
| `copied_from_id` | text | plans are changed by copying, never by editing a published one | Internal | keep |

### `box_office_plan_seats` (guarded)

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| `plan_id` | text | not null | Public | keep |
| `section`, `row`, `number` | text | unique together per plan | Public | keep |
| `x`, `y` | integer | position on the drawing, in plan units | Public | keep |
| `kind` | text | `seat`, `wheelchair_space`, `companion`, `removable` | Public | keep |
| `displaces` | text | `wheelchair_space` only: a JSON list of the `removable` seats of this plan that come out to make the space. Empty for a permanent space | Internal | keep |
| `flags` | text | JSON list: `restricted_view`, `aisle`, `step_free`, `transfer` (a seat suited to someone transferring from a wheelchair) | Public | keep |
| `default_band_name` | text | suggests a band when a performance is set up | Internal | keep |

### `box_office_performance_seats` (guarded)

The plan as it stood when the performance went on sale, so a later change to the plan never moves a sold seat.

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| `performance_id` | text | not null | Public | keep |
| `plan_seat_id` | text | unique with `performance_id` | Public | keep |
| `pool_id` | text | the band this seat is sold in at this performance | Internal | keep |
| `label` | text | "Stalls C12", copied | Public | keep |

A seat taken off sale (a sound desk position, a broken seat) is a staff hold on that seat, not a flag, so it uses the same claim and is counted the same way.

## Payments

One payment can cover things owned by different modules, such as tickets and bar items on the one card reader (part 3, "One payment for tickets and something else"). So an intent says how much is being collected, and its **parts** say what for.

Payments knows about money moving, never about tickets. It holds no card data: an integrated provider keeps the card, and the platform keeps only the provider's reference.

### `payments_provider_accounts` (plain)

One configured connection to a provider. Secrets are Worker secrets as Foundations rules; this table holds none.

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| `provider` | text | the id of a contribution to the point `payments.provider`, such as `cash` or `stripe` | Internal | keep |
| `label` | text | "Box office card reader" | Internal | keep |
| `channels` | text | JSON list of `online`, `desk` | Internal | keep |
| `mode` | text | `live` or `test`; a test account can never settle a live order | Internal | keep |
| `external_ref` | text | the provider's own account or merchant id | Internal | keep |
| `active` | integer | boolean | Internal | keep |

### `payments_readers` (plain)

A physical card reader paired with a provider account.

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| `provider_account_id` | text | not null | Internal | keep |
| `label` | text | "Foyer reader" | Internal | keep |
| `external_ref` | text | the provider's reader id | Internal | keep |
| `active` | integer | boolean | Internal | keep |

### `payments_sessions` (guarded)

One person's turn at a till, from opening to cashing up.

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| `point_label` | text | "Box office", "Bar" | Internal | keep |
| `opened_by`, `closed_by` | text | account | Personal | keep reference |
| `opened_at`, `closed_at` | integer |  | Internal | keep |
| `state` | text | `open`, `counting`, `closed` | Internal | keep |
| `float_minor` | integer | CHECK >= 0 | Internal | keep |
| `expected_cash_minor` | integer | computed at close from attempts | Internal | keep |
| `counted_cash_minor` | integer | typed at close | Internal | keep |
| `variance_note` | text | required when counted differs from expected; max 200 | Personal free text | blank |
| `currency` | text |  | Internal | keep |

Unique index on `opened_by` where state is not `closed`: a person has one open session.

### `payments_intents` (guarded)

A decision to collect one amount for one purpose.

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| `amount_minor` | integer | CHECK > 0; the sum of its parts | Internal | keep |
| `currency` | text |  | Internal | keep |
| `channel` | text | `online`, `desk` | Internal | keep |
| `state` | text | `open`, `succeeded`, `cancelled`, `expired`, `unfulfilled` | Internal | keep |
| `expires_at` | integer |  | Internal | keep |
| `session_id` | text | desk only | Internal | keep |
| `settled_at` | integer |  | Internal | keep |

An intent has no owner of its own. Who it is for is said by its parts.

### `payments_intent_parts` (guarded)

One row per thing an intent pays for. An ordinary ticket order is an intent with one part.

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| `intent_id` | ref `payments_intents` | not null | Internal | keep |
| `owner_module`, `owner_record` | text | who the part is for: a module id and one of its record ids, such as `box-office` and an order id. Unique with `intent_id` | Internal | keep |
| `open` | integer | 1 while the intent is `open`, null afterwards; kept by the trigger that moves the intent's state | Internal | keep |
| `amount_minor` | integer | CHECK > 0 | Internal | keep |
| `refunded_minor` | integer | default 0; **CHECK (refunded\_minor >= 0 AND refunded\_minor <= amount\_minor)**; trigger-kept | Internal | keep |
| `settled_at` | integer | set in the settle batch | Internal | keep |

Enforced in the database:

- Unique index on `(owner_module, owner_record)` where `open` is 1: a record has at most one open intent collecting for it. This is where the one-open-intent rule lives.
- The parts of an intent sum to its amount. The intent and its parts are written in one batch whose last statement asserts the sum, and a trigger refuses any later insert, delete or change of amount on a part, so the sum cannot drift.
- The table holds no personal data and has no subject. It follows its intent's retention.

### `payments_attempts` (guarded)

One try at collecting an intent by one method. A split payment is several attempts on one intent whose amounts sum to it.

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| `intent_id` | text | not null | Internal | keep |
| `provider_account_id` | text | not null | Internal | keep |
| `method` | text | `card_online`, `card_reader`, `card_attested`, `cash`, `other_attested` | Internal | keep |
| `amount_minor` | integer | CHECK > 0 | Internal | keep |
| `state` | text | `started`, `pending`, `succeeded`, `failed`, `cancelled`, `unknown` | Internal | keep |
| `idempotency_key` | text | unique; sent to the provider | Internal | keep |
| `provider_ref` | text | unique with provider account when not null | Internal | keep |
| `reader_id` | text | reader attempts | Internal | keep |
| `fee_minor` | integer | the provider's fee once known; null until then | Internal | keep |
| `refunded_minor` | integer | default 0; **CHECK (refunded\_minor >= 0 AND refunded\_minor <= amount\_minor)**; trigger-kept | Internal | keep |
| `tendered_minor` | integer | cash only, for the change calculation | Internal | keep |
| `answered_by` | text | account; who attested, for attested methods | Personal | keep reference |
| `failure_code` | text | a code from a fixed list, never the provider's free text | Internal | keep |
| `started_at`, `answered_at` | integer |  | Internal | keep |

Enforced in the database:

- Unique index on `reader_id` where state is `started` or `pending`: a reader runs one payment at a time.
- Trigger on state: `started` may move to `pending`, `succeeded`, `failed` or `cancelled`; `pending` to `succeeded`, `failed`, `cancelled` or `unknown`; `unknown` to `succeeded` or `failed` only. `succeeded`, `failed` and `cancelled` are final. A `pending` attempt becomes `cancelled` only on the provider's word that it stopped (part 3).
- Trigger on the intent: the sum of succeeded attempts never exceeds the intent's amount.

### `payments_attempt_events` (append-only)

Everything that was heard about an attempt, in the order it was heard.

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| `attempt_id` | text | not null | Internal | keep |
| `kind` | text | `started`, `provider_pending`, `provider_succeeded`, `provider_failed`, `attested_succeeded`, `attested_failed`, `cancelled`, `timed_out`, `reconciled` | Internal | keep |
| `source` | text | `webhook`, `poll`, `person`, `system` | Internal | keep |
| `webhook_event_id` | text | when the source is a webhook | Internal | keep |
| `by` | text | account, when the source is a person | Personal | keep reference |
| `at` | integer |  | Internal | keep |

### `payments_refunds` (guarded)

**Staff actors and account merge.** `requested_by` and `approved_by` here, `answered_by` on attempts and `closed_by` on sessions record who did something, so on an account merge they are declared `alias`: the row keeps the id it was written with, which resolves to the surviving account. `payments_sessions.opened_by` is the session's subject and is declared `move`. Because two different stored ids can now be one person, the rule that nobody approves their own refund is applied by the service on resolved accounts: it resolves `requested_by` to its surviving account before comparing it with the approver. The CHECK compares stored ids and stays as the backstop.

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| `attempt_id` | text | the payment being refunded; a refund always goes back the way the money came | Internal | keep |
| `part_id` | ref `payments_intent_parts` | not null; the part being refunded, which names the owner | Internal | keep |
| `amount_minor` | integer | CHECK > 0 | Internal | keep |
| `state` | text | `requested`, `approved`, `sent`, `succeeded`, `failed`, `declined` | Internal | keep |
| `idempotency_key` | text | unique | Internal | keep |
| `provider_ref` | text |  | Internal | keep |
| `requested_by` | text | account; null for an automatic refund | Personal | keep reference |
| `self_approve_limit_minor` | integer | not null; the value of `payments.refunds.self-approve-up-to` copied when the refund was requested; 0 means two people | Internal | keep |
| `approved_by` | text | account; **CHECK (approved\_by IS NULL OR requested\_by IS NULL OR approved\_by <> requested\_by OR amount\_minor <= self\_approve\_limit\_minor)** | Personal | keep reference |
| `decline_reason_term_id` | ref `core_terms` | required for `declined`; from the refund decline reasons | Internal | keep |
| `fee_returned_minor` | integer | provider fee handed back, if any | Internal | keep |

One trigger keeps both counters. A refund entering `approved` adds its amount to its part's `refunded_minor` and to its attempt's `refunded_minor`; one entering `failed` subtracts it from both. Nothing else moves them: a `declined` refund was never approved, so it was never counted. The CHECKs on the part and on the attempt therefore refuse a refund that would take either total past what was paid, however two refunds race.

The CHECK on `approved_by` is what makes the self-approve limit real. The requester may be the approver only when the amount is at or under the limit stored on that refund. The limit is a copy, so the database needs no setting to judge it and a later change to the setting cannot loosen a refund already requested. With the limit at zero, which is how it ships, the CHECK is the plain two-person rule.

### `payments_webhook_events` (plain, with a retention sweep)

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| `provider_account_id` | text | not null | Internal | keep |
| `provider_event_id` | text | **unique with `provider_account_id`**: a repeat delivery inserts nothing | Internal | keep |
| `type` | text | the provider's event type | Internal | keep |
| `signature_ok` | integer | boolean; an event that fails is stored and never acted on | Internal | keep |
| `attempt_id` | text | once matched | Internal | keep |
| `received_at`, `handled_at` | integer |  | Internal | keep |

The event body is not stored. The handler keeps the id and type, then asks the provider for the current state of the payment, so nothing personal from a provider's payload rests in the database. The table is not append-only: `attempt_id` and `handled_at` are filled in after the row is written, and the task `payments.prune-webhooks` deletes rows older than the retention setting.

## Finance: the ledger

Double-entry. Every posting is a set of entries that sum to zero in one currency: a positive amount is a debit, a negative amount a credit. Nothing in these tables is personal, which is deliberate: the ledger survives every erasure untouched.

### `finance_accounts` (plain, with a locked core)

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| `code` | text | unique; the theatre's own nominal code | Internal | keep |
| `name` | text |  | Internal | keep |
| `kind` | text | `asset`, `liability`, `income`, `expense`, `equity` | Internal | keep |
| `module` | text | not null; the one module that may post to this account. Set by Finance for a declared account, and chosen by the administrator for an account they add | Internal | keep |
| `system_key` | text | unique when not null; `<module>.<key>` for an account a module declared through `finance.system-account` | Internal | keep |
| `scope` | text | null, or the record the account is for, such as a provider account id for a clearing account; unique with `system_key` | Internal | keep |
| `active` | integer | boolean; an account with entries can be retired, never deleted | Internal | keep |

Finance ships no accounts of its own. Each module declares the accounts it posts to through `finance.system-account` (part 4), and Finance creates them, locked, when the module is switched on. A theatre renames and recodes them but cannot remove them.

| Module | Accounts it declares |
| --- | --- |
| Box office | `box-office.ticket-income`, `box-office.deferred-ticket-income`, `box-office.booking-fee-income`, `box-office.donation-income`, `box-office.pass-liability` |
| Payments | `payments.cash` (cash in tills), `payments.card-clearing` (one per provider account, by `scope`), `payments.bank`, `payments.provider-fees`, `payments.cash-variance`, `payments.unfulfilled` |

A trigger refuses an entry whose posting's `source_module` is not the account's `module`, except that Payments may write the entries an owner returned for its own part (part 4). To let the trigger judge that, finance\_entries has one more column than the table of columns shows: for\_module (text, null, Internal, keep), which Payments sets to the part's owner. The trigger requires the account's module to equal for\_module when it is set and the posting's source\_module otherwise, and for\_module may differ from source\_module only when source\_module is payments. A declared account's code starts as its system key, such as box-office.ticket-income, until the treasurer recodes it.

### `finance_postings` (append-only)

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| `idempotency_key` | text | **unique**: the same business fact is posted once | Internal | keep |
| `source_module`, `source_type`, `source_id` | text | what caused it | Internal | keep |
| `kind` | text | `sale`, `refund`, `fee`, `payout`, `recognition`, `transfer`, `cash_variance`, `unfulfilled`, `correction`, `opening`. `transfer` moves value between a module's own accounts with no money moving, such as a pass used or a cancellation fee kept | Internal | keep |
| `reverses_id` | text | the posting this one undoes; unique when not null, so a posting is reversed once | Internal | keep |
| `period_id` | text | not null | Internal | keep |
| `occurred_at` | integer | when the fact happened | Internal | keep |
| `posted_at` | integer | when it was written | Internal | keep |
| `posted_by` | text | account; null for the system | Personal | keep reference |

No memo column: a free-text field in an append-only table could never be erased.

### `finance_entries` (append-only)

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| `posting_id` | text | not null | Internal | keep |
| `account_id` | text | not null | Internal | keep |
| `amount_minor` | integer | CHECK <> 0 | Internal | keep |
| `currency` | text | every entry of a posting has the same one | Internal | keep |
| `production_id`, `performance_id` | text | null when not attributable | Internal | keep |
| `tax_code` | text | `finance_tax_codes`; default `none` | Internal | keep |
| `tax_minor` | integer | the tax part of the amount; 0 for `none` | Internal | keep |

### `finance_seals` (append-only)

The row that makes a posting real. Reports read only sealed postings.

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| `posting_id` | text | primary key | Internal | keep |
| `entry_count` | integer | CHECK >= 2 | Internal | keep |

Enforced in the database, and proved in case 11 of the Proof tab:

- Trigger before a seal is inserted: the posting's entries sum to zero, share one currency, and number exactly `entry_count`. Otherwise the whole batch fails.
- Trigger before an entry is inserted: refused if the posting is already sealed.
- Trigger before a posting is inserted: refused if its period is closed.
- Because a posting, its entries and its seal travel in the caller's one batch, an unsealed posting cannot exist after a commit. A check on the health screen counts them anyway and expects zero.

### `finance_periods` (plain until closed)

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| `label` | text | "October 2026" | Internal | keep |
| `starts_on`, `ends_on` | text | dates in the theatre's time zone; periods never overlap | Internal | keep |

### `finance_period_closes` (append-only)

Closing is a row, not a flag. The newest row for a period says whether it is closed.

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| `period_id` | text | not null | Internal | keep |
| `action` | text | `close`, `reopen` | Internal | keep |
| `by` | text | account | Personal | keep reference |
| `at` | integer |  | Internal | keep |
| `debits_minor`, `credits_minor` | integer | the period's totals at that moment, so a later mismatch is detectable | Internal | keep |
| `reason_term_id` | text | required for `reopen` | Internal | keep |

### `finance_tax_codes` (plain)

| Column | Type | Constraints | Class | On erasure |
| --- | --- | --- | --- | --- |
| `code` | text | primary key; `none` always exists | Internal | keep |
| `label` | text |  | Internal | keep |
| `rate_basis_points` | integer | CHECK >= 0 | Internal | keep |
| `active` | integer | boolean | Internal | keep |

The first release ships only `none`. The columns exist so that a VAT-registered theatre can be supported later without a migration of the ledger.

## Where the lessons came from

| Design choice | Source |
| --- | --- |
| Capacity as a constraint, not a check in code | Proscenium [decision 0006](https://github.com/newtheatre/proscenium/blob/main/docs/decisions/0006-capacity-is-a-database-constraint.md); taken further here, from a conditional write to a CHECK |
| Append-only money in integer minor units | Proscenium [decision 0004](https://github.com/newtheatre/proscenium/blob/main/docs/decisions/0004-append-only-ledger-in-pence.md); changed here from a single-entry list to double entry |
| A period close is an appended row | Proscenium [decision 0064](https://github.com/newtheatre/proscenium/blob/main/docs/decisions/0064-a-period-close-is-a-row-appended-never-a-flag-on-the-ledger.md) |
| Every charge is an attempt with a recorded answer | Proscenium [decision 0096](https://github.com/newtheatre/proscenium/blob/main/docs/decisions/0096-every-till-charge-is-an-attempt-answered-by-sumup-or-by-the-person-at-the-reader.md) |
| Raising capacity above the venue is confirmed by a person | Proscenium [decision 0124](https://github.com/newtheatre/proscenium/blob/main/docs/decisions/0124-selling-a-performance-above-its-venue-is-confirmed-not-typed.md) |
| Baskets and waiting-list places count against capacity while they last | pretix counts paid and pending orders, unexpired cart positions, blocking vouchers and the waiting list against a quota ([pretix concepts](https://docs.pretix.eu/dev/development/concepts.html)) |
| An idempotency key on every call to a provider | Stripe: retries with the same key return the saved result, and keys may be pruned after 24 hours ([Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests)) |
| Webhook events stored by provider event id and never trusted for order | Stripe: endpoints "might occasionally receive the same event more than once" and delivery order is not guaranteed ([Stripe webhooks](https://docs.stripe.com/webhooks)) |
