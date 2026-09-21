// The rota is one workflow spread across four sidebar entries, in this order (K-123 criterion
// 12). Declared once, so a screen names the step after it without hard-coding a neighbour's path.

export interface RotaStep {
  key: string
  // The sidebar's name for the screen, and the verb a screen before it offers to reach it by.
  label: string
  onward: string
  to: string
}

export const ROTA_FLOW = [
  { key: 'templates', label: 'Shift templates', onward: 'Set the templates up', to: '/rota/manage/templates' },
  { key: 'board', label: 'Rota board', onward: 'Fill the rota', to: '/rota/manage/shifts' },
  { key: 'openings', label: 'Bar openings', onward: 'Plan the bar openings', to: '/rota/manage/openings' },
  { key: 'approvals', label: 'Approvals', onward: 'Approve the claims', to: '/rota/manage/approvals' },
] as const satisfies readonly RotaStep[]

export type RotaStepKey = (typeof ROTA_FLOW)[number]['key']

// Null at the end of the flow and for anything outside it, so the last screen offers no way on
// rather than looping back to the first.
export function rotaStepAfter(key: string): RotaStep | null {
  const at = ROTA_FLOW.findIndex(step => step.key === key)
  if (at < 0) return null
  return ROTA_FLOW[at + 1] ?? null
}
