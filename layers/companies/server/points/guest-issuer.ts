// Contract for companies.guest-issuer (spec part 4, BO-75): the selling module that turns a company's
// guest places into tickets. Box office contributes it; holding unnamed places comes with CO-26.
import type { UnitView } from '#kit'

export interface GuestRequest {
  performanceId: string
  /** The guest, made from a name and email by Identity's rule (G2). */
  accountId: string
  places: number
}

export interface GuestIssuer {
  /** Issues complimentary tickets in the unit and says the order; refuses the unit when none are left. */
  issue: (unit: UnitView, request: GuestRequest) => Promise<{ orderRef: string }>
}
