// A copy as the screens show it: its state as a badge, and the shape the server sends.
import type { PeriodRule, ReportColumn, ReportView, ScopeKind, Words } from '../../shared/reports'
import type { ReportTable } from '../../shared/table'

export type RunState = 'queued' | 'running' | 'done' | 'failed' | 'expired' | 'stale'

export interface RunListed {
  id: string
  report: string
  name: Words
  question: {
    columns: ReportColumn[]
    rowsBy?: string
    acrossBy?: string
    filter: ReportView['filter']
    keyLabels: Record<string, string>
    scope: { kind: ScopeKind, id: string | null, title: string | null }
    period: { rule: PeriodRule, from: string, to: string }
  }
  state: RunState
  failure: string | null
  rows: number | null
  unavailable: { measure: string, reason: string }[]
  createdAt: number
  finishedAt: number | null
  mine: boolean
}

export interface RunOpened extends RunListed { table: ReportTable | null }

const COLOURS: Record<RunState, 'neutral' | 'success' | 'warning' | 'error'> = { queued: 'neutral', running: 'neutral', done: 'success', failed: 'error', expired: 'neutral', stale: 'warning' }

export function useRunState() {
  const { t } = useT()
  return { badge: (state: RunState) => ({ label: t(`reports.runs.states.${state}`), color: COLOURS[state] }) }
}
