// What the door counter's presses add up to (BO-73), worked out the same way on the server and on a
// device that is offline. Inside never goes below nought: more out than in is a miscount, not a debt.

import { deviceId } from './device-ids'

export interface Tap { id: string, kind: 'in' | 'out' | 'undo', quantity: number, reversesId: string | null, tappedAt: number }

export interface Tally {
  /** People counted in with the counter, ticketed or not. */
  in: number
  out: number
  inside: number
  /** The most inside at any moment, by the devices' clocks. */
  peak: number
}

export function tally(taps: Tap[]): Tally {
  const undone = new Set(taps.filter(t => t.kind === 'undo' && t.reversesId).map(t => t.reversesId!))
  let counted = 0
  let left = 0
  let peak = 0
  for (const tap of [...taps].sort((a, b) => a.tappedAt - b.tappedAt || a.id.localeCompare(b.id))) {
    if (tap.kind === 'undo' || undone.has(tap.id)) continue
    if (tap.kind === 'in') counted += tap.quantity
    else left += tap.quantity
    peak = Math.max(peak, counted - left)
  }
  return { in: counted, out: left, inside: Math.max(0, counted - left), peak }
}

/** How full the counter reads: under the warning share, warning, or full (HC4). It never refuses. */
export function fullness(inside: number, capacity: number | null, warnPercent: number): 'ok' | 'warning' | 'full' {
  if (!capacity) return 'ok'
  if (inside >= capacity) return 'full'
  return inside * 100 >= capacity * warnPercent ? 'warning' : 'ok' // not-policy: a percentage
}

/** A press's id, made on the device (HC2). */
export function newTapId(now = Date.now()): string {
  return deviceId('hct', now)
}
