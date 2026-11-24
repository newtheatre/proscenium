// What the performance form (ProductionPerformances.vue) shows for a performance and sends for it.
import type { ShowDefaultValues, ShowOverrides } from './show-defaults'
import { noOverrides } from './show-defaults'

const MINUTE = 60_000 // not-policy: milliseconds in a minute

export type PerformanceShape = 'timed' | 'drop-in'

/** The parts of a listed performance the form reads. */
export interface FormPerformance {
  shape: PerformanceShape
  spaceId: string
  startsAt: number
  doorsAt: number | null
  endsAt: number
  intervalCount: number | null
  intervalMinutes: number | null
  capacity: number | null
  label: string | null
  externalBookingUrl: string | null
}

export interface PerformanceFormState { shape: PerformanceShape, spaceId: string, startsAt: number | null, endsAt: number | null }

/** The form's own fields for a performance, or for a new one in the space given. */
export function formOf(p: FormPerformance | null, fallbackSpaceId: string): PerformanceFormState {
  return { shape: p?.shape ?? 'timed', spaceId: p?.spaceId ?? fallbackSpaceId, startsAt: p?.startsAt ?? null, endsAt: p?.shape === 'drop-in' ? p.endsAt : null }
}

/** A performance shows as changed only where it differs from the show's defaults. */
export function overridesOf(p: FormPerformance | null, defaults: ShowDefaultValues | null): ShowOverrides {
  if (!p || !defaults) return noOverrides()
  const running = Math.round((p.endsAt - p.startsAt) / MINUTE)
  const doors = p.doorsAt === null ? null : Math.round((p.startsAt - p.doorsAt) / MINUTE)
  return {
    runningMinutes: running === defaults.runningMinutes ? null : running,
    doorsBeforeMinutes: doors === null || doors === defaults.doorsBeforeMinutes ? null : doors,
    intervalCount: p.intervalCount,
    intervalMinutes: p.intervalMinutes,
    capacity: p.capacity,
    label: p.label ?? '',
    bookedElsewhere: !!p.externalBookingUrl,
    externalBookingUrl: p.externalBookingUrl ?? '',
  }
}

export interface PerformanceBodyInput {
  space: { value: string, venueId: string }
  form: PerformanceFormState
  overrides: ShowOverrides
  defaults: ShowDefaultValues
  editing: boolean
  shapeChangeable: boolean
}

/** The request body for adding or changing a performance. */
export function performanceBody(input: PerformanceBodyInput): Record<string, unknown> {
  const { space, form, overrides: o, defaults: d, editing } = input
  const body: Record<string, unknown> = {
    venueId: space.venueId,
    spaceId: space.value,
    startsAt: form.startsAt,
    capacity: o.capacity,
    intervalCount: o.intervalCount,
    intervalMinutes: o.intervalMinutes,
    label: o.label,
    externalBookingUrl: o.bookedElsewhere ? o.externalBookingUrl.trim() || null : null,
    // Left empty, the end and doors come from the show's defaults; an edit always sends them, so the end moves with the start.
    runningMinutes: o.runningMinutes ?? (editing ? d.runningMinutes : null),
    doorsBeforeMinutes: o.doorsBeforeMinutes ?? (editing ? d.doorsBeforeMinutes : null),
  }
  if (input.shapeChangeable) body.shape = form.shape
  // A drop-in's hours are its own: open from and open until, with no doors or intervals.
  if (form.shape === 'drop-in') Object.assign(body, { endsAt: form.endsAt, runningMinutes: null, doorsBeforeMinutes: null, intervalCount: null, intervalMinutes: null })
  return body
}

/** The wide-reaching changes saving makes to a scheduled performance. */
export function changeKinds(p: FormPerformance, form: PerformanceFormState, overrides: ShowOverrides, body: Record<string, unknown>): ('reschedule' | 'move' | 'capacity')[] {
  const kinds: ('reschedule' | 'move' | 'capacity')[] = []
  const endsAt = form.shape === 'drop-in' ? form.endsAt! : form.startsAt! + (body.runningMinutes as number) * MINUTE
  if (form.startsAt !== p.startsAt || endsAt !== p.endsAt) kinds.push('reschedule')
  if (form.spaceId !== p.spaceId) kinds.push('move')
  if (overrides.capacity !== p.capacity) kinds.push('capacity')
  return kinds
}
