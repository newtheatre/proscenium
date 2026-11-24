// Availability requests as people see them: the states an asked person can be in, with the word and
// tone each shows, and the shapes of S4, S5 and S11's reads.
import type { AskedRequest } from './useMyAvailability'

export type AskedState = AskedRequest['state']
export interface RequestView {
  request: { id: string, title: string, message: string | null, from: string, to: string, dueOn: string, open: boolean, module: boolean, remindedAt: number | null }
  mine: AskedState | null
  organiser: boolean
  onBehalf: boolean
  counts: Record<AskedState, number>
  people?: { accountId: string, name: string, state: AskedState, answeredAt: number | null }[]
}
export interface SentRow { id: string, title: string, from: string, to: string, dueOn: string, open: boolean, module: boolean, counts: Record<AskedState, number> }
export interface Sent { today: string, defaultDue: string, groups: { id: string, label: string, hint?: string }[], requests: SentRow[] }

const TONE: Record<AskedState, 'info' | 'success' | 'warning' | 'neutral'> = { asked: 'info', answered: 'success', lapsed: 'warning', withdrawn: 'neutral' }

export function useRequestStates() {
  const { t } = useT()
  return {
    tone: (s: AskedState) => TONE[s],
    label: (s: AskedState) => t(`availability.asked.states.${s}`),
  }
}
