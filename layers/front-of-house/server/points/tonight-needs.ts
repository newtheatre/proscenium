// Contract for front-of-house.tonight-needs: the people coming tonight who have said what help they
// need, for the Needs tonight panel on the board (AC-1). Box office gives those holding tickets who
// are on the access scheme and share their arrangements for the night. Front of house calls no other
// module, so the board works without one.
import type { UnitView } from '#kit'

export interface TonightNeed {
  /** Who: the name on the booking. */
  name: string
  /** Where they sit, as the seller knows it (a band or a seat), or null. */
  seat: string | null
  /** What kind of help: the access need's key and label. Never a note or anything medical. */
  needs: { key: string, label: string }[]
  /** Companions they are allowed. */
  companions: number
}

export interface TonightNeeds {
  /**
   * Reads tonight's needs for one performance. Front of house asks only for a viewer leading the
   * night, and the read is audited with the unit's actor. An answer that throws is left out.
   */
  read: (unit: UnitView, performanceId: string) => Promise<TonightNeed[]>
}
