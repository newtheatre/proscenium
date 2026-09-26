import { saysMoney } from './bar'
import { z } from 'zod'

// Reconciliation to the expected SumUp Z figure (F-118): every figure is a fresh query over the
// ledger for the show night, never a stored total, the same discipline F-119's reports keep.

export interface BarReconciliation {
  night: string
  cardSalesPence: number
  // Bookings collected and walk-ups sold at the bar, on the bar's reader (F-122, F-123).
  ticketsPence: number
  tabSettlementsPence: number
  compsCount: number
  compsForegonePence: number
  discountsPence: number
  refundsPence: number
  tabChargesPence: number
  expectedPence: number
}

// What the desk took the same night, alongside the bar's own figure (criterion 1). Bar and desk
// share the one physical reader (0005), so this is what the two sum to.
export interface NightReconciliation {
  bar: BarReconciliation
  deskTakingsPence: number
  wholeNightExpectedPence: number
}

// What the one reader should show at the till close (F-118 criterion 1, issue 1308): a show night
// has one reader and one login for the desk and the bar, so the Z is the whole night's.
export interface ReaderExpectation {
  totalPence: number
  barPence: number
  deskPence: number
}

export function readerExpectation(night: NightReconciliation): ReaderExpectation {
  return {
    totalPence: night.wholeNightExpectedPence,
    barPence: night.wholeNightExpectedPence - night.deskTakingsPence,
    deskPence: night.deskTakingsPence,
  }
}

// Where the figure came from, leaving out a side that took nothing.
export function saysWhereItWasTaken(expected: ReaderExpectation): string {
  if (expected.barPence !== 0 && expected.deskPence !== 0) {
    return `bar ${saysMoney(expected.barPence)}, box office ${saysMoney(expected.deskPence)}`
  }
  if (expected.barPence !== 0) return 'all of it at the bar'
  if (expected.deskPence !== 0) return 'all of it at the box office'
  return ''
}

export function saysExpectedOnTheReader(expected: ReaderExpectation): string {
  const total = saysMoney(expected.totalPence)
  const where = saysWhereItWasTaken(expected)
  if (!where) return total
  return expected.barPence !== 0 && expected.deskPence !== 0 ? `${total} (${where})` : `${total}, ${where}`
}

export function saysReaderShouldShow(expected: ReaderExpectation): string {
  return `The reader should show ${saysExpectedOnTheReader(expected)}`
}

// Over is positive; the screen's preview and the close's own record share this one sum.
export function closeVariancePence(night: NightReconciliation, actualZPence: number): number {
  return actualZPence - night.wholeNightExpectedPence
}

export interface CloseLine {
  label: string
  pence: number
}

// This bar's own figures under the lead line (criterion 2), a nought one left out, so a tab or a
// refund nobody made is not read as a figure to find on the reader.
export function closeBreakdown(bar: BarReconciliation): CloseLine[] {
  const figure = (label: string, pence: number): CloseLine[] => (pence === 0 ? [] : [{ label, pence }])
  return [
    ...figure('Drinks on card', bar.cardSalesPence),
    ...figure('Tickets taken at the bar', bar.ticketsPence),
    ...figure('Tab settlements', bar.tabSettlementsPence),
    // Counted by the comp, since one can give away something that cost nothing.
    ...(bar.compsCount > 0 ? [{ label: `Comps (${bar.compsCount}), forgone`, pence: bar.compsForegonePence }] : []),
    ...figure('Discounts given', bar.discountsPence),
    ...figure('Refunds', bar.refundsPence),
    ...figure('Tab charges (credit extended)', bar.tabChargesPence),
  ]
}

const pence = z.number().int().min(0)

// The officer keys in what the reader shows; the expected figure is never sent by the client,
// only recomputed server-side at close, the reverse of 0005's usual cross-check direction.
export const closeTillSessionForm = z.object({
  id: z.string().trim().min(1, 'Say which session you mean'),
  actualZPence: pence,
  // Required only when the reader disagrees with the ledger; the route enforces that half, since
  // whether they disagree is only known once the expected figure is recomputed (criterion 3).
  varianceNote: z.string().trim().min(1, 'Say why the reader and the ledger disagree').max(500).optional(),
})

export type CloseTillSessionInput = z.output<typeof closeTillSessionForm>
