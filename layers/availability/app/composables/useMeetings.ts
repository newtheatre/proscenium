// Arranged meetings as screens see them (M1 to M5): the shapes of S4, S7 and S12's reads, and the word
// and tone for each answer.
import type { MeetingState, Response } from '../../shared/levels'

export type { MeetingState, Response }
export interface MeetingRow { id: string, title: string, from: number, to: number, state: MeetingState, response: Response | null, going: number, invited: number }
export interface MeetingView {
  meeting: { id: string, title: string, from: number, to: number, place: string | null, notes: string | null, state: MeetingState, over: boolean, cancelledReason: string | null, organiser: string, findId: string | null }
  local: { date: string, start: number, end: number, today: string, step: number }
  organiser: boolean
  mine: Response | null
  counts: Record<Response, number>
  invitees?: { accountId: string, name: string, response: Response }[]
  under18?: { late: string[], oneToOne: boolean }
}

const TONE: Record<Response, 'info' | 'success' | 'neutral'> = { 'pending': 'info', 'going': 'success', 'not-going': 'neutral' }

export function useMeetingWords() {
  const { t } = useT()
  const dates = useDates()
  return {
    response: (r: Response) => t(`availability.meeting.responses.${r}`),
    tone: (r: Response) => TONE[r],
    when: (m: { from: number, to: number }) => dates.range(m.from, m.to, 'dateTime'),
  }
}
