import type { Availability } from './programme'

// The one shape `/my` reads (K-127 criterion 1): eight column allow-lists, nothing a tile does
// not show, so an identifier never rides along because a query happened to carry it.
export interface MySummary {
  onShiftTonight: boolean
  shift: { shiftId: string, role: string, showTitle: string, venueName: string, startsAt: number, status: string } | null
  membership: { state: 'current' | 'grace' | 'lapsed' | 'none', until: string | null, claim: 'open' | 'declined' | null }
  room: { bookingId: string, roomName: string, startsAt: number, endsAt: number, purpose: string | null, cancellable: boolean } | null
  training: {
    held: number
    available: number
    nextStep: { id: string, name: string } | null
    nextSession: { id: string, moduleName: string, heldOn: string, startsAt: string, place: string | null } | null
  }
  passes: {
    active: { id: string, typeName: string, covers: string | null, status: string }[]
    request: { state: string } | null
  }
  notifications: { id: string, title: string, link: string | null, createdAt: number }[]
  nextShow: { slug: string, title: string, firstAt: number, lastAt: number, availability: Availability } | null
}
