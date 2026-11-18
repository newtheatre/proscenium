// A production's performances, in time order (C-03), and long runs still being made (C-04), with
// the lists the console's pickers offer: venues and the spaces in them that can hold performances,
// access features, cancel reasons and the production's staging effects. With them, what a new performance takes when it says nothing
// (the production's defaults over the theatre's, each space's doors and capacity over those), the
// run presets and which one each space starts from, and whether anything here sells tickets. The
// whole days closed to performances come too, so the date fields can grey them out for someone who
// may not manage closures (L40).
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute, first, nowMs, useSetting } from '#kit'
import { listPerformances, performanceDefaults, theatreDefaults } from '../../../../../programme/performances'
import { listRunPresets, theatreRunPreset } from '../../../../../programme/run-presets'
import { sellsHere } from '../../../../../programme/booking'
import { listVenues } from '../../../../../places/service'
import { closuresBetween } from '../../../../../places/closures'
import { openRuns } from '../../../../../programme/runs'
import { productionEffects } from '../../../../../programme/guidance'
import { listTerms } from '../../../../../vocabularies/service'

const DAY = 86_400_000 // not-policy: milliseconds in a day

export default defineRoute({
  ability: 'core.production.view',
  record: event => ['core.production', getRouterParam(event, 'id')],
  rateLimit: 'default',
  input: z.object({}),
}, async (_event, { record }) => {
  const option = (t: { id: string, label: string, retired: boolean }) => ({ id: t.id, label: t.label, retired: t.retired })
  const now = nowMs()
  const [performances, runs, venues, access, reasons, effects, defaults, theatre, presets, usualPreset, scheduleRuns, sells, closures] = await Promise.all([
    listPerformances({ productionId: record!.id }),
    openRuns(record!.id),
    listVenues({ archived: true }),
    listTerms('core.access-feature', { includeRetired: true }),
    listTerms('core.cancel-reason'),
    productionEffects(record!.id),
    performanceDefaults(record!.id, null),
    theatreDefaults(),
    listRunPresets(),
    theatreRunPreset(),
    useSetting('core.programme.schedule-runs') as Promise<boolean>,
    sellsHere(),
    closuresBetween(now - DAY, now + 400 * DAY), // not-policy: as far ahead as the Closures screen looks
  ])
  const own = await first<{ doors_before_minutes: number | null, capacity: number | null }>('SELECT doors_before_minutes, capacity FROM core_productions WHERE id = ?', record!.id)
  const used = new Set(performances.flatMap(p => [p.venueId, p.spaceId]))
  return {
    performances,
    runs,
    options: {
      venues: venues
        .map(v => ({ id: v.id, name: v.name, archived: v.archived, spaces: v.spaces.filter(s => (s.performable && !s.archived) || used.has(s.id)).map(s => ({ id: s.id, name: s.name, defaultCapacity: s.defaultCapacity, doorsBeforeMinutes: s.doorsBeforeMinutes, runPresetId: s.runPresetId, archived: s.archived })) }))
        .filter(v => (!v.archived && v.spaces.length) || used.has(v.id)),
      access: access.map(option),
      reasons: reasons.map(option),
      effects: effects.map(e => ({ id: e.termId, label: e.label })),
      presets: presets.map(({ id, name, slots }) => ({ id, name, slots })),
      closed: closures.filter(c => c.allDay && c.blocksPerformances).map(c => ({ venueId: c.venueId, spaceId: c.spaceId, startsAt: c.startsAt, endsAt: c.endsAt })),
    },
    // The production's own (null where it has none) beside the theatre's, so a screen can say where a value comes from.
    defaults: { ...defaults, productionDoorsBeforeMinutes: own?.doors_before_minutes ?? null, productionCapacity: own?.capacity ?? null, theatreDoorsBeforeMinutes: theatre.doorsBeforeMinutes, usualPreset, scheduleRuns, sellsHere: sells },
  }
})
