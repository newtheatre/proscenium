# 12. Build notes

What the build has settled that the parts above leave open, slice by slice.

## The gate

- **CO-01, CO-02, CO-05.** Abilities are declared as the routes that need them land, since the conformance check refuses an ability nothing requires; part 6 stays the full list. The fact `companies.contact-of` is read from the contacts table, through the account scope, on every check. Moves a person makes go through one route, `POST /api/companies/engagements/<id>/<move>` (`confirm`, `cancel`). Confirming a hire needs at least one call until Spaces bookings carry the engagement's reference (CO-14).
- **CO-03.** Approval is `POST /api/companies/settlements/<id>/approve`. The preparer is refused on the statement (`prepared_by IS NOT` the approver) and by the table's check, so the rule binds owners too, whatever the own-record exemption says. With Invoices off, the posting's key is `companies:settlement:<id>:approved`, kind `recognition`, one debit and credit pair per line that posts (M1); a note never posts. With Invoices on, approval posts nothing and announces `companies.settlement.approved`; the half of the Invoicing case where issuing posts once waits for Invoicing's `invoicing.line-owner` point, and its test lands with it.
