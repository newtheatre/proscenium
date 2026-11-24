# 9. Questions for Matt

Eight questions. All eight are answered and written into the body, which reads as if it had always said so.

## Answered

| # | Question | Answer | Where it lands |
| --- | --- | --- | --- |
| 1 | One module, or exports on their own? | One module with two menu entries, as recommended | Overview; tab 4, manifest and navigation |
| 2 | Build the students' union export first, before any invoice? | Yes, as recommended: IE-01 to IE-06 are the gate | Tab 7 |
| 3 | VAT on invoices? | Build VAT now, not the recommendation (which was to leave it out of the first release) | Rules I-06, I-30, I-41 to I-46 and E-16; Finance amendment F-A2; screen S15; stories IE-31, IE-41, IE-42; the VAT tests. Whether NNT itself sits inside the union's VAT registration is Integration's fact question 9a, and decides only NNT's Finance setting. VAT on every other sale comes into the first release too (Integration question 12, answered) |
| 5 | Does every bill need a second person? | Always, an Owner included, as recommended (ruling R3-17) | Rule I-10, abilities |
| 6 | Who may write off a debt? | The Owner role, never the person who issued the invoice, as recommended | Rule I-26, abilities, IE-27 |
| 7 | Card payment on invoices by default? | Off by default, not the recommendation: off until the treasurer turns it on, even when Stripe is set up | Setting `invoicing.pay-online` (default false), rule I-18, IE-12, S12, test I-card-off-default |
| 8 | Should the platform keep bank details for people and suppliers it pays? | Keep them, encrypted, in Payments, as recommended; this also answers Integration's question 5 | Amendment P-A1, `payments_payees` |
| 4 | What exactly does the union want now, and who holds its template? | Matt does not know who holds the union's export template and is not sure one exists. So the union preset rebuilds old Proscenium's I-108 format as specified, without waiting for one; the profile screen lets the treasurer change columns if the union ever sends a template. On VAT, Matt believes NNT does not pay it but is not certain. The union's trading arm is UNU Services Ltd (company 02223522), separate from the UoNSU charity (company 1136986, charity 7229624). NNT's setup therefore leaves finance.tax.registered off | IE-04 and the union preset (tab 4); NNT's Finance settings |
