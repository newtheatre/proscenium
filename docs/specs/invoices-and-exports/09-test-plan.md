# 8. Test plan

Sixty named cases that must never regress: one proof on real D1, then integration and end-to-end. Tests run on CI only (repository rule). Each case names the rule or story it guards; the failing test lands before the code.

## Proof on D1

| Case | What | Pass when |
| --- | --- | --- |
| P-IE-1 | 50 issues of 50 drafts on one series at once, on a deployed D1 | Numbers are exactly 1 to 50 with none missing or repeated; every invoice has one sealed posting; failed batches left no row (I-12, I-13) |

## Exports

| Case | Guards | Asserts |
| --- | --- | --- |
| E-every-entry-once | E-02 | Over a fixture year, entry rows equal the count of sealed entries in range; summed daily lines equal the entries they sum |
| E-unsealed-absent | E-01 | A posting with no seal is in no export |
| E-balances | E-04 | Debit column total equals credit column total, split and signed, before the total line |
| E-unmapped-kept | E-05 | An account with no code goes out on its own lines as UNMAPPED, counted on the screen |
| E-kind-override | E-06 | A refund kind override takes its own code; other kinds fall back to the account's |
| E-same-bytes | E-09 | Two runs of a closed range with no code change have equal SHA-256; changing one code changes the digest and the screen says Would differ |
| E-local-days | E-01 | A sale at 00:30 on 1 August London time falls in the new year; dates are the theatre's, not UTC |
| E-ceiling | E-07 | 50,001 entries are refused with the count; nothing is written |
| E-formula-guard | E-10 | A production titled "=SUM(A1)" is written with a leading apostrophe; amount cells stay numbers |
| E-no-personal | E-15 | A fixture with names in orders and invoices produces a file containing none of them |
| E-union-fixture | IE-04 | The union preset over a fixture equals a file the old system made for the same lines, column for column |
| E-closed-flag | E-08 | A range with one open day reads Open; reopening a closed period flips it |
| E-schedule-waits | E-12 | A monthly schedule with `only_closed` sends nothing until the close event, then exactly once |
| E-schedule-link | E-13 | The schedule's email carries a link, no attachment, and the link needs sign-in with `export.take` |
| E-xero-shape | IE-21 | Each package format's header row equals the stored template copy; blank narration rows continue a journal |
| E-tax-map | E-16 | A Xero file writes each line's mapped rate name; a code with no entry is written as UNMAPPED and counted on the screen |

## Invoices out

| Case | Guards | Asserts |
| --- | --- | --- |
| I-issue-one-batch | I-13 | A forced failure of the posting leaves the invoice a draft with no number taken |
| I-frozen | I-14 | Any update to a frozen column of an issued invoice or its lines raises from the trigger; deleting either is refused |
| I-email-correctable | I-15 | Only the listed columns change after issue, each audited |
| I-total-mismatch | I-05 | A client total one penny off is refused quoting both figures |
| I-rounding | I-05 | 2.5 × £0.33 is £0.83 and 1.5 × £0.03 is £0.05 (half away from zero); a unit price with a fraction of a penny is refused |
| I-zero-refused | I-02 | An invoice totalling 0 cannot be issued |
| I-backdate | I-08 | An issue date earlier than the limit, or in the future, is refused |
| I-second-person | I-09 | Above the threshold the creator cannot issue; another treasurer can |
| I-overpay | I-22 | A payment above outstanding is refused quoting both; two payments racing for the last £10 allocate one |
| I-late-card | I-22 | A card payment settling after a bank transfer closed the invoice is refused and Payments returns it |
| I-close-event | I-23 | Reaching the total closes, clears the token and announces paid exactly once |
| I-reversal | I-25 | A reversal reopens the invoice and the receivable agrees again |
| I-credit-limit | I-27 | Credit notes beyond the original's total are refused |
| I-credit-own | ability | The issuer cannot credit their own invoice, even holding the Owner role |
| I-credit-refund | I-28, I-29 | Crediting a paid invoice leaves the rest open on the credit note until refunded |
| I-write-off | I-26 | Refused before `min-overdue`; posts bad debts once; issuer refused, an Owner included |
| I-reminder-once | I-31 | Running the daily task three times sends each step once |
| I-reminder-paid | I-33 | No reminder for an invoice paid before the task runs |
| I-token | I-18, I-32 | A wrong, used or expired token gets one answer; a reminder's new token kills the old |
| I-pdf-retry | I-16 | A failed PDF leaves the invoice issued; the job makes it and the email follows |
| I-card-off-default | I-18, IE-12 | With a Stripe provider account and the setting untouched, the public page offers no card payment; turning invoicing.pay-online on shows it; with no Stripe account the setting cannot be turned on |

## VAT

| Case | Guards | Asserts |
| --- | --- | --- |
| V-unregistered | I-06 | While `finance.tax.registered` is false, a line with any code but `none` is refused, and the PDF, page and screens show nothing about VAT |
| V-code-needed | I-06 | While registered, a line with `none` is refused; a new line starts on the party's default, else the owner's suggestion, else the setting |
| V-line-vat | I-42 | 20% of £0.33 is £0.07 and of £0.32 is £0.06 (half away from zero, per line); the invoice's VAT is the sum of its lines; a client gross one penny off is refused quoting both |
| V-issue-posting | I-44 | Issue posts the gross to the receivable, each net to its account with `tax_code` and `tax_minor`, and the VAT to `finance.vat-output` with `for_module` finance; the posting balances |
| V-bill-input | I-43, I-44 | A bill with typed VAT a penny off the worked figure is accepted with a warning; approval debits `finance.vat-input` the typed VAT |
| V-credit-vat | I-44 | A credit note for half a line reverses half its net and half its VAT at the original's rate, even after the code's rate changed |
| V-tax-number | I-41 | Issue is refused while `finance.tax.number` is unset; once set, the number is frozen on the invoice and changing the setting later leaves it |
| V-rate-frozen | I-42, F-A2 | Changing a used code's rate is refused by Finance's trigger; a draft saved before a new code keeps its copied rate |
| V-report-agrees | I-46 | Over a fixture quarter, S15's output and input VAT equal the movement this module posted on Finance's two VAT accounts; the cash basis counts a part-paid invoice's VAT in proportion to the money received |
| V-bad-debt-relief | I-45 | A written-off VAT invoice appears under bad debt relief only once six months have passed since the later of due date and time of supply, never under cash accounting, and never again after its claim is recorded |

## Bills and line owners

| Case | Guards | Asserts |
| --- | --- | --- |
| B-own-approval | I-10 | The logger cannot approve, even holding the Owner role; another approver can |
| B-file-required | I-11 | Submitting without the supplier's file is refused |
| B-duplicate | I-11 | The same supplier number for the same supplier is refused naming the earlier bill |
| B-parent-body | IE-23 | Paid by the parent body credits `payments.parent-body` and closes the bill |
| O-owner-total | I-36 | An owner returning entries that do not total the line refuses the whole batch |
| O-owner-refuses | I-37 | An owner's refusal leaves the invoice a draft with its reason shown |
| O-owner-off | I-38 | With the owner switched off, issue is refused; receiving money on an issued invoice still works |
| O-one-posting | I-36, Companies | A settlement invoiced through Invoices posts once, at issue, never also at approval |
| L-agrees | I-40 | After a fixture of 200 mixed actions the receivable and payable balances equal outstanding totals |

## End to end

| Case | Journey |
| --- | --- |
| X-union-year | Treasurer maps codes, takes the union export for a closed year, takes it again, sees Same file |
| X-hire-invoice | A settlement is approved in Companies, the draft appears, is issued, the hirer pays by card from the email, Companies shows the settlement paid |
| X-bill | A technical manager logs a bill with a PDF, the treasurer approves it against a budget line, records it paid by the parent body |
