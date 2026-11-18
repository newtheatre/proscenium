// Shared set-up for the front of house tests: scheduled performances made through the core's own
// routes, duties and shifts made through front of house's.
import { expect } from 'vitest'
import { changeSetting, createUnit, fact, newId, setClock } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import createProduction from '../../../core/server/api/core/productions/index.post'
import addPerformance from '../../../core/server/api/core/productions/[id]/performances/index.post'
import schedulePerformance from '../../../core/server/api/core/performances/[id]/schedule.post'
import patchPerformance from '../../../core/server/api/core/performances/[id]/index.patch'
import cancelPerformance from '../../../core/server/api/core/performances/[id]/cancel.post'
import createVenue from '../../../core/server/api/core/venues/index.post'
import dutiesPost from '../../server/api/front-of-house/duties/index.post'
import dutiesGet from '../../server/api/front-of-house/duties/index.get'
import dutyPut from '../../server/api/front-of-house/duties/[id]/index.put'
import dutyArchive from '../../server/api/front-of-house/duties/[id]/archive.post'
import templatesGet from '../../server/api/front-of-house/rota-templates/index.get'
import templatesPost from '../../server/api/front-of-house/rota-templates/index.post'
import templatePut from '../../server/api/front-of-house/rota-templates/[id]/index.put'
import templateArchive from '../../server/api/front-of-house/rota-templates/[id]/archive.post'
import templateApply from '../../server/api/front-of-house/rota-templates/[id]/apply.post'
import shiftsPost from '../../server/api/front-of-house/performances/[id]/shifts/index.post'
import shiftsGet from '../../server/api/front-of-house/performances/[id]/shifts/index.get'
import shiftsApply from '../../server/api/front-of-house/performances/[id]/shifts/apply.post'
import shiftsPublishAll from '../../server/api/front-of-house/performances/[id]/shifts/publish.post'
import occasionPost from '../../server/api/front-of-house/shifts/index.post'
import bulkPublish from '../../server/api/front-of-house/shifts/publish.post'
import shiftPatch from '../../server/api/front-of-house/shifts/[id]/index.patch'
import publishPost from '../../server/api/front-of-house/shifts/[id]/publish.post'
import unpublishPost from '../../server/api/front-of-house/shifts/[id]/unpublish.post'
import cancelPost from '../../server/api/front-of-house/shifts/[id]/cancel.post'
import signUpPost from '../../server/api/front-of-house/shifts/[id]/sign-up.post'
import shiftGet from '../../server/api/front-of-house/shifts/[id]/index.get'
import assignPost from '../../server/api/front-of-house/shifts/[id]/assign.post'
import shiftPeopleGet from '../../server/api/front-of-house/shifts/[id]/people.get'
import confirmPost from '../../server/api/front-of-house/assignments/[id]/confirm.post'
import declinePost from '../../server/api/front-of-house/assignments/[id]/decline.post'
import removePost from '../../server/api/front-of-house/assignments/[id]/remove.post'
import releasePost from '../../server/api/front-of-house/assignments/[id]/release.post'
import keepPost from '../../server/api/front-of-house/assignments/[id]/keep.post'
import coverPost from '../../server/api/front-of-house/assignments/[id]/cover.post'
import openShiftsGet from '../../server/api/front-of-house/open-shifts.get'
import myShiftsGet from '../../server/api/front-of-house/me/shifts.get'
import calendarGet from '../../server/api/front-of-house/assignments/[id]/calendar.ics.get'
import feedGet from '../../server/api/front-of-house/calendar/[token].get'
import feedPost from '../../server/api/front-of-house/me/calendar/index.post'
import feedReset from '../../server/api/front-of-house/me/calendar/reset.post'
import checkInPost from '../../server/api/front-of-house/assignments/[id]/check-in.post'
import timingsPost from '../../server/api/front-of-house/performances/[id]/timings.post'
import timingDelete from '../../server/api/front-of-house/performances/[id]/timings/[kind].delete'
import notComingPost from '../../server/api/front-of-house/assignments/[id]/not-coming.post'
import extendPost from '../../server/api/front-of-house/performances/[id]/extend.post'
import tonightGet from '../../server/api/front-of-house/performances/[id]/tonight.get'
import tonightListGet from '../../server/api/front-of-house/tonight.get'
import runGet from '../../server/api/front-of-house/performances/[id]/checklists/[checklistId]/index.get'
import runOpen from '../../server/api/front-of-house/performances/[id]/checklists/[checklistId]/open.post'
import itemPut from '../../server/api/front-of-house/performances/[id]/checklists/[checklistId]/items/[itemId].put'
import runComplete from '../../server/api/front-of-house/performances/[id]/checklists/[checklistId]/complete.post'
import runReopen from '../../server/api/front-of-house/performances/[id]/checklists/[checklistId]/reopen.post'
import checklistsGet from '../../server/api/front-of-house/checklists/index.get'
import checklistsPost from '../../server/api/front-of-house/checklists/index.post'
import checklistPut from '../../server/api/front-of-house/checklists/[id]/index.put'
import checklistArchive from '../../server/api/front-of-house/checklists/[id]/archive.post'
import cardsGet from '../../server/api/front-of-house/emergency-cards/index.get'
import cardPut from '../../server/api/front-of-house/emergency-cards/[venueId].put'
import incidentsPost from '../../server/api/front-of-house/incidents/index.post'
import incidentsGet from '../../server/api/front-of-house/incidents/index.get'
import incidentsMine from '../../server/api/front-of-house/incidents/mine.get'
import incidentGet from '../../server/api/front-of-house/incidents/[id]/index.get'
import incidentOpen from '../../server/api/front-of-house/incidents/[id]/open.post'
import incidentReview from '../../server/api/front-of-house/incidents/[id]/review.post'
import peoplePost from '../../server/api/front-of-house/incidents/[id]/people/index.post'
import personPut from '../../server/api/front-of-house/incidents/[id]/people/[personId]/index.put'
import personRemove from '../../server/api/front-of-house/incidents/[id]/people/[personId]/remove.post'
import actionsPost from '../../server/api/front-of-house/incidents/[id]/actions/index.post'
import actionResolve from '../../server/api/front-of-house/incidents/[id]/actions/[actionId]/resolve.post'
import incidentClose from '../../server/api/front-of-house/incidents/[id]/close.post'
import incidentReopen from '../../server/api/front-of-house/incidents/[id]/reopen.post'
import reportGet from '../../server/api/front-of-house/performances/[id]/report/index.get'
import reportNotes from '../../server/api/front-of-house/performances/[id]/report/notes.post'
import reportSignOff from '../../server/api/front-of-house/performances/[id]/report/sign-off.post'
import outcomePost from '../../server/api/front-of-house/assignments/[id]/outcome.post'
import nightReportsGet from '../../server/api/front-of-house/night-reports.get'
import hoursGet from '../../server/api/front-of-house/hours/index.get'
import hoursExport from '../../server/api/front-of-house/hours/export.get'
import rotaGet from '../../server/api/front-of-house/rota.get'
import performanceRotaGet from '../../server/api/front-of-house/performances/[id]/rota.get'
import peopleSearch from '../../server/api/front-of-house/incident-people/index.get'
import personRedact from '../../server/api/front-of-house/incident-people/[id]/redact.post'
import { call, env, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'

export const handle = server({
  'POST /api/core/productions': createProduction,
  'POST /api/core/productions/:id/performances': addPerformance,
  'POST /api/core/performances/:id/schedule': schedulePerformance,
  'PATCH /api/core/performances/:id': patchPerformance,
  'POST /api/core/performances/:id/cancel': cancelPerformance,
  'POST /api/core/venues': createVenue,
  'POST /api/front-of-house/duties': dutiesPost,
  'GET /api/front-of-house/duties': dutiesGet,
  'PUT /api/front-of-house/duties/:id': dutyPut,
  'POST /api/front-of-house/duties/:id/archive': dutyArchive,
  'GET /api/front-of-house/rota-templates': templatesGet,
  'POST /api/front-of-house/rota-templates': templatesPost,
  'PUT /api/front-of-house/rota-templates/:id': templatePut,
  'POST /api/front-of-house/rota-templates/:id/archive': templateArchive,
  'POST /api/front-of-house/rota-templates/:id/apply': templateApply,
  'POST /api/front-of-house/performances/:id/shifts': shiftsPost,
  'GET /api/front-of-house/performances/:id/shifts': shiftsGet,
  'POST /api/front-of-house/performances/:id/shifts/apply': shiftsApply,
  'POST /api/front-of-house/performances/:id/shifts/publish': shiftsPublishAll,
  'POST /api/front-of-house/shifts': occasionPost,
  'POST /api/front-of-house/shifts/publish': bulkPublish,
  'PATCH /api/front-of-house/shifts/:id': shiftPatch,
  'POST /api/front-of-house/shifts/:id/publish': publishPost,
  'POST /api/front-of-house/shifts/:id/unpublish': unpublishPost,
  'POST /api/front-of-house/shifts/:id/cancel': cancelPost,
  'POST /api/front-of-house/shifts/:id/sign-up': signUpPost,
  'GET /api/front-of-house/shifts/:id': shiftGet,
  'POST /api/front-of-house/shifts/:id/assign': assignPost,
  'GET /api/front-of-house/shifts/:id/people': shiftPeopleGet,
  'POST /api/front-of-house/assignments/:id/confirm': confirmPost,
  'POST /api/front-of-house/assignments/:id/decline': declinePost,
  'POST /api/front-of-house/assignments/:id/remove': removePost,
  'POST /api/front-of-house/assignments/:id/release': releasePost,
  'POST /api/front-of-house/assignments/:id/keep': keepPost,
  'POST /api/front-of-house/assignments/:id/cover': coverPost,
  'GET /api/front-of-house/assignments/:id/calendar.ics': calendarGet,
  'GET /api/front-of-house/calendar/:token': feedGet,
  'POST /api/front-of-house/me/calendar': feedPost,
  'POST /api/front-of-house/me/calendar/reset': feedReset,
  'GET /api/front-of-house/open-shifts': openShiftsGet,
  'GET /api/front-of-house/me/shifts': myShiftsGet,
  'POST /api/front-of-house/assignments/:id/check-in': checkInPost,
  'POST /api/front-of-house/performances/:id/timings': timingsPost,
  'DELETE /api/front-of-house/performances/:id/timings/:kind': timingDelete,
  'POST /api/front-of-house/assignments/:id/not-coming': notComingPost,
  'POST /api/front-of-house/performances/:id/extend': extendPost,
  'GET /api/front-of-house/performances/:id/tonight': tonightGet,
  'GET /api/front-of-house/tonight': tonightListGet,
  'GET /api/front-of-house/performances/:id/checklists/:checklistId': runGet,
  'POST /api/front-of-house/performances/:id/checklists/:checklistId/open': runOpen,
  'PUT /api/front-of-house/performances/:id/checklists/:checklistId/items/:itemId': itemPut,
  'POST /api/front-of-house/performances/:id/checklists/:checklistId/complete': runComplete,
  'POST /api/front-of-house/performances/:id/checklists/:checklistId/reopen': runReopen,
  'GET /api/front-of-house/checklists': checklistsGet,
  'POST /api/front-of-house/checklists': checklistsPost,
  'PUT /api/front-of-house/checklists/:id': checklistPut,
  'POST /api/front-of-house/checklists/:id/archive': checklistArchive,
  'GET /api/front-of-house/emergency-cards': cardsGet,
  'PUT /api/front-of-house/emergency-cards/:venueId': cardPut,
  'GET /api/front-of-house/performances/:id/report': reportGet,
  'POST /api/front-of-house/performances/:id/report/notes': reportNotes,
  'POST /api/front-of-house/performances/:id/report/sign-off': reportSignOff,
  'POST /api/front-of-house/assignments/:id/outcome': outcomePost,
  'GET /api/front-of-house/night-reports': nightReportsGet,
  'GET /api/front-of-house/hours': hoursGet,
  'GET /api/front-of-house/hours/export': hoursExport,
  'GET /api/front-of-house/rota': rotaGet,
  'GET /api/front-of-house/performances/:id/rota': performanceRotaGet,
  'GET /api/front-of-house/incident-people': peopleSearch,
  'POST /api/front-of-house/incident-people/:id/redact': personRedact,
  'POST /api/front-of-house/incidents': incidentsPost,
  'GET /api/front-of-house/incidents': incidentsGet,
  'GET /api/front-of-house/incidents/mine': incidentsMine,
  'GET /api/front-of-house/incidents/:id': incidentGet,
  'POST /api/front-of-house/incidents/:id/open': incidentOpen,
  'POST /api/front-of-house/incidents/:id/review': incidentReview,
  'POST /api/front-of-house/incidents/:id/people': peoplePost,
  'PUT /api/front-of-house/incidents/:id/people/:personId': personPut,
  'POST /api/front-of-house/incidents/:id/people/:personId/remove': personRemove,
  'POST /api/front-of-house/incidents/:id/actions': actionsPost,
  'POST /api/front-of-house/incidents/:id/actions/:actionId/resolve': actionResolve,
  'POST /api/front-of-house/incidents/:id/close': incidentClose,
  'POST /api/front-of-house/incidents/:id/reopen': incidentReopen,
})

export type Person = ReturnType<typeof person>

export const manager = person(['core.production.create', 'core.performance.schedule', 'core.performance.cancel', 'core.venue.manage', 'front-of-house.duty.manage', 'front-of-house.shift.manage', 'front-of-house.checklist.manage'])
export const volunteer = (): Person => person(['front-of-house.shift.sign-up'])

export const NOV_16 = Date.UTC(2026, 10, 16, 12)
export const MINUTE = 60_000
let keys = 0
let dutyCount = 0

export async function req<T = any>(method: string, path: string, body?: unknown, actor: Person = manager): Promise<{ status: number, body: T }> {
  const headers = method !== 'GET' ? { 'idempotency-key': `foh${++keys}-${newId('req')}` } : undefined
  const response = await call(handle, method, path, { actor, body, headers })
  return { status: response.status, body: await response.json() as T }
}

export async function setting(key: string, value: unknown): Promise<void> {
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), key, value, { reason: 'test', confirm: true })
    await unit.commit()
  })
}

/** Switches the module on and sets the time zone. */
export async function ready(): Promise<void> {
  ;(env as any).CORE_TURNSTILE_SECRET_KEY = ''
  await setModule('front-of-house', true)
  await setting('core.locale.time-zone', 'Europe/London')
  await setting('core.site.origin', 'https://theatre.example')
}

export interface Made { id: string, startsAt: number, endsAt: number, venueId: string, spaceId: string }

let n = 0
/** A scheduled performance, starting at 19:30 on a day in 2027. */
export async function performance(): Promise<Made> {
  n++
  resetRateLimits()
  setClock(NOV_16)
  const production = await req('POST', '/api/core/productions', { title: `Front of house show ${n}`, kind: 'own' })
  const venue = await req('POST', '/api/core/venues', { name: `Front of house venue ${n}` })
  const startsAt = Date.UTC(2027, n % 12, n % 28 + 1, 19, 30)
  const made = await req('POST', `/api/core/productions/${production.body.id}/performances`, { venueId: venue.body.venueId, spaceId: venue.body.spaceId, startsAt })
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  expect((await req('POST', `/api/core/performances/${made.body.id}/schedule`, {})).status).toBe(200)
  const [row] = await rows<{ ends_at: number }>('SELECT ends_at FROM core_performances WHERE id = ?', made.body.id)
  return { id: made.body.id, startsAt, endsAt: row!.ends_at, venueId: venue.body.venueId, spaceId: venue.body.spaceId }
}

export async function duty(name: string, options: { isLead?: boolean, requirements?: string[] } = {}): Promise<string> {
  const made = await req('POST', '/api/front-of-house/duties', { name: `${name} ${++dutyCount}`, callBeforeMinutes: 60, stayAfterMinutes: 30, ...options })
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  return made.body.dutyId
}

export async function shift(performanceId: string, dutyId: string, places = 2, publish = true): Promise<string> {
  const made = await req('POST', `/api/front-of-house/performances/${performanceId}/shifts`, { dutyId, places })
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  if (publish) expect((await req('POST', `/api/front-of-house/shifts/${made.body.shiftId}/publish`, {})).status).toBe(200)
  return made.body.shiftId
}

export const notes = (type: string, accountId: string) => rows<{ id: string }>('SELECT id FROM core_notifications WHERE type_key = ? AND account_id = ?', type, accountId)

export const shiftRow = async (id: string) => (await rows<Record<string, number | string | null>>('SELECT * FROM front_of_house_shifts WHERE id = ?', id))[0]!

export const holds = (name: string, actor: Person, record?: readonly [string, string]) => inContext(() => fact(name, actor, record))
