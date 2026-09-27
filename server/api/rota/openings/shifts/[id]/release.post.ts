import { changes } from '#shared/utils/audit'
import { formatLondon } from '#shared/utils/london'
import { openingReleaseRefusal } from '#shared/utils/rota-openings'

// The holder's own release, the same self-service a shift has (E-107 criterion 1): the slot goes
// back on the open list naming nobody, and the officer is not in the way of it.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const account = await requireAccount(event)

  const held = await openingShiftDetail(id)
  if (!held) throw noSuch('bar opening slot')
  if (held.userId !== account.id) throw createError({ statusCode: 403, statusMessage: 'That slot is not yours to release' })

  const entry = auditEntry({
    actorId: account.id,
    action: 'bar-opening-shift.released',
    target: `bar-opening-shift:${id}`,
    detail: changes({ status: [held.status, 'OPEN'] }),
  })

  // The cut-off rides the write, read from the opening's own night (E-107 criterion 1).
  const at = Math.floor(Date.now() / 1000)
  const applied = await withOpeningConstraints(() =>
    auditedWrite(db.all<{ id: string }>(releaseOpeningShiftStatement(id, account.id, at)), entry))

  if (!applied) {
    const now = await openingShiftDetail(id)
    throw createError({ statusCode: 409, statusMessage: openingReleaseRefusal(now, account.id, held.status) })
  }

  // Close to the night it reaches the rota officers now, as a shift's release does; further out
  // it waits for their digest (E-107 criterion 2). An opening has no duty manager slot to chase.
  const noticeHours = await configValue(event, 'SHIFT_RELEASE_NOTICE_HOURS')
  if ((held.startsAt - at) / 3600 <= noticeHours) {
    const officers = await rotaOfficers()
    const when = formatLondon(new Date(held.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' })
    await Promise.all(officers.map(officer => notify(event, {
      userId: officer.id,
      type: 'shift.released',
      context: { name: '', show: held.label, venue: held.venueName, when, role: 'bar' },
    })))
  }

  return { ok: true, status: 'OPEN' }
})
