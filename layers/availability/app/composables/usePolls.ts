// Polls as screens see them (F7, F8): the shapes of S4, S7, S8 and S9's reads, and the word and tone
// for each answer and state.
import { clockOf } from '../../shared/grid'
import type { PollState, ShownLevel, Vote } from '../../shared/levels'

export type { PollState, Vote }
export interface PollSlot { id: string, date: string, start: number, end: number }
export interface PollRow { id: string, title: string, answersBy: number, state: PollState, open: boolean, answered: number, asked: number }
export interface PollView {
  poll: { id: string, title: string, length: number, answersBy: number, state: PollState, open: boolean, decidedSlotId: string | null, organiser: string }
  slots: PollSlot[]
  organiser: boolean
  asked: boolean
  mine: Record<string, Vote>
  myLevels: Record<string, ShownLevel>
  tallies?: Record<string, Record<Vote, number>>
  people?: { accountId: string, name: string, must: boolean, answers: Record<string, Vote> }[]
}

export const VOTE_ORDER: Vote[] = ['yes', 'if-need-be', 'no']
const VOTE_TONE: Record<Vote, 'success' | 'warning' | 'danger'> = { 'yes': 'success', 'if-need-be': 'warning', 'no': 'danger' }
const STATE_TONE: Record<PollState, 'info' | 'success' | 'neutral'> = { polling: 'info', decided: 'success', abandoned: 'neutral' }

export function usePollWords() {
  const { t } = useT()
  const dates = useDates()
  return {
    vote: (v: Vote) => t(`availability.poll.votes.${v}`),
    voteTone: (v: Vote) => VOTE_TONE[v],
    state: (p: { state: PollState, open: boolean }) => t(`availability.poll.states.${p.state === 'polling' && !p.open ? 'closed' : p.state}`),
    stateTone: (s: PollState) => STATE_TONE[s],
    when: (s: { date: string, start: number, end: number }) => `${dates.dayNamed(s.date)}, ${clockOf(s.start)} to ${clockOf(s.end)}`,
  }
}
