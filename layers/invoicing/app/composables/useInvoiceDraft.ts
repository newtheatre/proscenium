// A draft invoice as its editor holds it: who it is to, its lines, and the figures the server will
// work out (the shared arithmetic, so the screen and the server agree to the penny).
import { lineNet, lineTax } from '../../shared/invoices'

export interface DraftChoices {
  accounts: { id: string, code: string, name: string }[]
  registered: boolean
  taxCodes: { code: string, label: string, rateBp: number }[]
  defaultTaxCode: string
  taxNumberSet: boolean
}
export interface DraftLineForm { key: string, description: string, quantity: number, unitMinor: number | null, accountId: string | undefined, taxCode: string | undefined }
export interface DraftForm {
  partyKind: 'account' | 'one-off'
  accountId: string | undefined
  billToName: string
  billToAddress: string
  billToEmail: string
  taxNumber: string
  reference: string
  suppliedOn: string
  notes: string
  internalNote: string
  lines: DraftLineForm[]
}
export interface SavedDraft {
  partyModule: string | null
  partyId: string | null
  billToName: string | null
  billToAddress: string
  billToEmail: string | null
  taxNumber: string
  reference: string
  suppliedOn: string | null
  notes: string
  internalNote: string
}
export interface SavedLine { description: string, quantityMilli: number, unitMinor: number, accountId: string | null, taxCode: string }

export type DraftBody = ReturnType<ReturnType<typeof useInvoiceDraft>['body']>

const MILLI = 1000 // not-policy: quantities are held in thousandths

export function useInvoiceDraft(choices: Ref<DraftChoices | null | undefined>) {
  const blankLine = (): DraftLineForm => ({
    key: crypto.randomUUID(),
    description: '',
    quantity: 1,
    unitMinor: null,
    accountId: choices.value?.accounts.length === 1 ? choices.value.accounts[0]!.id : undefined,
    taxCode: choices.value?.registered ? choices.value.defaultTaxCode : undefined,
  })
  const form = reactive<DraftForm>({ partyKind: 'one-off', accountId: undefined, billToName: '', billToAddress: '', billToEmail: '', taxNumber: '', reference: '', suppliedOn: '', notes: '', internalNote: '', lines: [blankLine()] })

  function load(saved: SavedDraft, lines: SavedLine[]) {
    Object.assign(form, {
      partyKind: saved.partyModule === 'core' ? 'account' : 'one-off',
      accountId: saved.partyModule === 'core' ? saved.partyId ?? undefined : undefined,
      billToName: saved.billToName ?? '',
      billToAddress: saved.billToAddress,
      billToEmail: saved.billToEmail ?? '',
      taxNumber: saved.taxNumber,
      reference: saved.reference,
      suppliedOn: saved.suppliedOn ?? '',
      notes: saved.notes,
      internalNote: saved.internalNote,
      lines: lines.length
        ? lines.map(l => ({ key: crypto.randomUUID(), description: l.description, quantity: l.quantityMilli / MILLI, unitMinor: l.unitMinor, accountId: l.accountId ?? undefined, taxCode: choices.value?.registered ? l.taxCode : undefined }))
        : [blankLine()],
    })
  }
  const addLine = () => form.lines.push(blankLine())
  const removeLine = (key: string) => { form.lines = form.lines.filter(l => l.key !== key) }

  const rateOf = (code: string | undefined) => choices.value?.taxCodes.find(c => c.code === code)?.rateBp ?? 0
  const worked = computed(() => form.lines.map((l) => {
    const netMinor = lineNet(Math.round(l.quantity * MILLI), l.unitMinor ?? 0)
    return { netMinor, taxMinor: choices.value?.registered ? lineTax(netMinor, rateOf(l.taxCode)) : 0 }
  }))
  const totals = computed(() => {
    const netMinor = worked.value.reduce((n, l) => n + l.netMinor, 0)
    const taxMinor = worked.value.reduce((n, l) => n + l.taxMinor, 0)
    return { netMinor, taxMinor, totalMinor: netMinor + taxMinor }
  })

  /** The body the server takes: a one-off party by name, or a person's account. */
  function body() {
    const optional = (s: string) => s.trim() || undefined
    return {
      party: form.partyKind === 'account' ? { kind: 'account' as const, accountId: form.accountId ?? '' } : { kind: 'one-off' as const },
      billToName: optional(form.billToName),
      billToAddress: form.billToAddress.trim(),
      billToEmail: optional(form.billToEmail) ?? null,
      taxNumber: form.taxNumber.trim(),
      reference: form.reference.trim(),
      suppliedOn: form.suppliedOn || null,
      notes: form.notes.trim(),
      internalNote: form.internalNote.trim(),
      lines: form.lines.map(l => ({
        description: l.description.trim(),
        quantityMilli: Math.round(l.quantity * MILLI),
        unitMinor: l.unitMinor ?? 0,
        accountId: l.accountId ?? '',
        ...(choices.value?.registered && l.taxCode ? { taxCode: l.taxCode } : {}),
      })),
    }
  }

  /** Each empty required box, named as UForm names its field. */
  function missing(): { name: string, message: string }[] {
    return [
      ...(form.partyKind === 'account' ? needs({ accountId: form.accountId }) : needs({ billToName: form.billToName.trim() })),
      ...form.lines.flatMap((l, i) => needs({ [`lines.${i}.description`]: l.description.trim(), [`lines.${i}.unitMinor`]: l.unitMinor, [`lines.${i}.accountId`]: l.accountId })),
    ]
  }
  return { form, worked, totals, load, addLine, removeLine, body, missing }
}
