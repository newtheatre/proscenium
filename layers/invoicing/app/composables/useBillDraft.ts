// A bill as its editor holds it: the supplier, their invoice's number and dates, and lines coded to
// expense accounts with the VAT typed from their invoice beside the figure the rate gives (rule I-43).
import { lineNet, lineTax } from '../../shared/invoices'
import type { DraftChoices } from './useInvoiceDraft'

export type BillChoices = Omit<DraftChoices, 'taxNumberSet'>
export interface BillLineForm { key: string, description: string, quantity: number, unitMinor: number | null, accountId: string | undefined, taxCode: string | undefined, taxMinor: number | null }
export interface SavedBill { partyModule: string | null, partyId: string | null, billToName: string, number: string | null, issueOn: string | null, dueOn: string | null, taxNumber: string, internalNote: string }
export interface SavedBillLine { description: string, quantityMilli: number, unitMinor: number, accountId: string | null, taxCode: string, taxMinor: number }
export type BillBody = ReturnType<ReturnType<typeof useBillDraft>['body']>

const MILLI = 1000 // not-policy: quantities are held in thousandths
const PENNY = 1 // not-policy: rule I-43 warns beyond a penny

export function useBillDraft(choices: Ref<BillChoices | null | undefined>) {
  const blankLine = (): BillLineForm => ({
    key: crypto.randomUUID(),
    description: '',
    quantity: 1,
    unitMinor: null,
    accountId: choices.value?.accounts.length === 1 ? choices.value.accounts[0]!.id : undefined,
    taxCode: choices.value?.registered ? choices.value.defaultTaxCode : undefined,
    taxMinor: null,
  })
  const form = reactive({ billToName: '', supplierNumber: '', issueOn: '', dueOn: '', taxNumber: '', internalNote: '', lines: [blankLine()] })

  function load(saved: SavedBill, lines: SavedBillLine[]) {
    Object.assign(form, {
      billToName: saved.billToName,
      supplierNumber: saved.number ?? '',
      issueOn: saved.issueOn ?? '',
      dueOn: saved.dueOn ?? '',
      taxNumber: saved.taxNumber,
      internalNote: saved.internalNote,
      lines: lines.length
        ? lines.map(l => ({ key: crypto.randomUUID(), description: l.description, quantity: l.quantityMilli / MILLI, unitMinor: l.unitMinor, accountId: l.accountId ?? undefined, taxCode: choices.value?.registered ? l.taxCode : undefined, taxMinor: choices.value?.registered ? l.taxMinor : null }))
        : [blankLine()],
    })
  }
  const addLine = () => form.lines.push(blankLine())
  const removeLine = (key: string) => { form.lines = form.lines.filter(l => l.key !== key) }

  const rateOf = (code: string | undefined) => choices.value?.taxCodes.find(c => c.code === code)?.rateBp ?? 0
  /** Each line's net, the VAT its rate gives, the VAT that counts (typed, else the rate's) and whether they differ. */
  const worked = computed(() => form.lines.map((l) => {
    const netMinor = lineNet(Math.round(l.quantity * MILLI), l.unitMinor ?? 0)
    const rateMinor = choices.value?.registered ? lineTax(netMinor, rateOf(l.taxCode)) : 0
    const taxMinor = choices.value?.registered ? (l.taxMinor ?? rateMinor) : 0
    return { netMinor, rateMinor, taxMinor, differs: Math.abs(taxMinor - rateMinor) > PENNY }
  }))
  const totals = computed(() => {
    const netMinor = worked.value.reduce((n, l) => n + l.netMinor, 0)
    const taxMinor = worked.value.reduce((n, l) => n + l.taxMinor, 0)
    return { netMinor, taxMinor, totalMinor: netMinor + taxMinor }
  })

  function body() {
    return {
      party: { kind: 'one-off' as const },
      billToName: form.billToName.trim() || undefined,
      supplierNumber: form.supplierNumber.trim(),
      issueOn: form.issueOn || null,
      dueOn: form.dueOn || null,
      taxNumber: form.taxNumber.trim(),
      internalNote: form.internalNote.trim(),
      lines: form.lines.map(l => ({
        description: l.description.trim(),
        quantityMilli: Math.round(l.quantity * MILLI),
        unitMinor: l.unitMinor ?? 0,
        accountId: l.accountId ?? '',
        ...(choices.value?.registered && l.taxCode ? { taxCode: l.taxCode, ...(l.taxMinor === null ? {} : { taxMinor: l.taxMinor }) } : {}),
      })),
    }
  }

  function missing(): { name: string, message: string }[] {
    return [
      ...needs({ billToName: form.billToName.trim() }),
      ...form.lines.flatMap((l, i) => needs({ [`lines.${i}.description`]: l.description.trim(), [`lines.${i}.unitMinor`]: l.unitMinor, [`lines.${i}.accountId`]: l.accountId })),
    ]
  }
  return { form, worked, totals, load, addLine, removeLine, body, missing }
}
