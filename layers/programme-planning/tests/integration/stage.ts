// Shared set-up for the programme planning tests: the module on, its routes mounted, and helpers that
// make a season, a production, a plan and a venue.
import { beforeAll, expect } from 'vitest'
import { changeSetting, createUnit, newId, setClock } from '#kit'
import type { Actor } from '#kit'
import { resetRateLimits } from '#kit/ratelimit'
import { call, env, inContext, person, rows, server, setModule } from '../../../../tests/integration/helpers'
import plansGet from '../../server/api/programme-planning/plans/index.get'
import seasonGet from '../../server/api/programme-planning/seasons/[season]/index.get'
import planPost from '../../server/api/programme-planning/seasons/[season]/plan.post'
import entriesGet from '../../server/api/programme-planning/plans/[id]/entries.get'
import entriesPost from '../../server/api/programme-planning/plans/[id]/entries.post'
import productionsGet from '../../server/api/programme-planning/plans/[id]/productions.get'
import bringPost from '../../server/api/programme-planning/plans/[id]/bring.post'
import boardGet from '../../server/api/programme-planning/plans/[id]/board.get'
import createVenue from '../../../core/server/api/core/venues/index.post'

export const app = server({
  'GET /api/programme-planning/plans': plansGet,
  'GET /api/programme-planning/seasons/:season': seasonGet,
  'POST /api/programme-planning/seasons/:season/plan': planPost,
  'GET /api/programme-planning/plans/:id/entries': entriesGet,
  'POST /api/programme-planning/plans/:id/entries': entriesPost,
  'GET /api/programme-planning/plans/:id/productions': productionsGet,
  'POST /api/programme-planning/plans/:id/bring': bringPost,
  'GET /api/programme-planning/plans/:id/board': boardGet,
  'POST /api/core/venues': createVenue,
})

export const NOV_24 = Date.UTC(2026, 10, 24, 12)
export const programmer = person(['programme-planning.plan.manage'])
export const looker = person(['programme-planning.plan.view'])

export async function req<T = any>(actor: Actor, method: string, path: string, body?: unknown): Promise<{ status: number, body: T }> {
  const response = await call(app, method, path, { actor, body, headers: { 'idempotency-key': newId('req') } })
  return { status: response.status, body: await response.json() as T }
}

export async function setting(key: string, value: unknown) {
  await inContext(async () => {
    const unit = createUnit()
    await changeSetting(unit.view(), key, value, { reason: 'test', confirm: true })
    await unit.commit()
  })
}

let n = 0
export async function season(fields: { startsOn?: string, endsOn?: string, state?: string } = {}): Promise<{ id: string, slug: string }> {
  n++
  const id = newId('sea')
  const slug = `plan-season-${n}`
  await rows('INSERT INTO core_seasons (id, slug, name, starts_on, ends_on, state, created_at) VALUES (?, ?, ?, ?, ?, ?, 0)', id, slug, `Plan season ${n}`, fields.startsOn ?? '2027-01-10', fields.endsOn ?? '2027-03-20', fields.state ?? 'draft')
  return { id, slug }
}

export async function production(seasonId: string | null, fields: { title?: string, state?: string, minutes?: number } = {}): Promise<string> {
  const id = newId('prd')
  await env.DB.prepare('INSERT INTO core_productions (id, slug, title, kind, season_id, running_minutes, state, listed, credits_public, interval_count, advisories_confirmed_none, created_at) VALUES (?, ?, ?, \'visiting\', ?, ?, ?, 1, 1, 0, 0, 0)')
    .bind(id, id, fields.title ?? 'Twelfth Night', seasonId, fields.minutes ?? 150, fields.state ?? 'draft').run()
  return id
}

export async function started(slug: string): Promise<string> {
  const made = await req(programmer, 'POST', `/api/programme-planning/seasons/${slug}/plan`, {})
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  return made.body.planId
}

beforeAll(async () => {
  setClock(NOV_24)
  resetRateLimits()
  await setModule('programme-planning', true)
  await setting('core.locale.time-zone', 'Europe/London')
})

export async function venue(name = 'Planning venue'): Promise<{ venueId: string, spaceId: string }> {
  const made = await req(person(['core.venue.manage']), 'POST', '/api/core/venues', { name })
  expect(made.status, JSON.stringify(made.body)).toBe(200)
  return made.body
}
