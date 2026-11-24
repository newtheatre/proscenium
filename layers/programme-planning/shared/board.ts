// The board's answer (PP-03), shared by the server and the screen.
export interface BoardSpace { id: string, name: string, venue: string, exclusive: boolean }
export interface BoardDay { day: string, start: number, end: number }
export interface BoardItem {
  kind: string
  module: string
  from: number
  to: number
  day: string
  lastDay: string
  yields: boolean
  record: { type: string, id: string }
  label: string | null
  /** Set when the item is one of this plan's own placements. */
  placement: { entryId: string, title: string } | null
}
export interface BoardAnswer {
  plan: { id: string, version: number, state: string, boardFrom: string, boardTo: string }
  days: BoardDay[]
  /** The day before and after the stretch read, inside the board's days. */
  before: string | null
  after: string | null
  spaces: BoardSpace[]
  occupancy: { spaceId: string, items: BoardItem[] }[]
}

export const BOARD_MAX_DAYS = 14 // not-policy: PP-03's one read
