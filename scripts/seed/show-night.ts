// The night itself: a rota in every shift status, a checklist part way through, incidents at every
// severity, age checks both ways, and the backstage board. Tonight and the night that is over.

import { ensure, holds, insert, insertOnly, seedId } from './statements'
import { personIn } from './people'
import type { People } from './people'
import type { Programme } from './programme'
import type { BoundStatement, SeedTarget } from './statements'

const DAY = 86_400

interface SeedShift {
  role: 'DUTY_MANAGER' | 'DOOR' | 'BAR'
  slot: number
  holder: string | null
  status: 'OPEN' | 'CLAIMED' | 'CONFIRMED' | 'DECLINED' | 'CANCELLED'
  needsReview?: true
  declineReason?: string
  notes?: string
}

// Tonight's rota, deliberately part way through: a screen that only ever sees a full rota is a
// screen nobody has tested against a gap.
const TONIGHT: SeedShift[] = [
  { role: 'DUTY_MANAGER', slot: 1, holder: 'rowan', status: 'CONFIRMED', notes: 'On site from 18:00.' },
  { role: 'DOOR', slot: 1, holder: 'priya', status: 'CONFIRMED' },
  { role: 'DOOR', slot: 2, holder: 'tomasz', status: 'CLAIMED' },
  { role: 'BAR', slot: 1, holder: 'devon', status: 'CONFIRMED' },
  { role: 'BAR', slot: 2, holder: null, status: 'OPEN' },
]

// Next week's, so the rota screen has something to claim and something already refused.
const NEXT_WEEK: SeedShift[] = [
  { role: 'DUTY_MANAGER', slot: 1, holder: 'aoife', status: 'CLAIMED', needsReview: true },
  { role: 'DOOR', slot: 1, holder: null, status: 'OPEN' },
  { role: 'DOOR', slot: 2, holder: 'mira', status: 'DECLINED', declineReason: 'Away that week, sorry.' },
  { role: 'BAR', slot: 1, holder: null, status: 'OPEN' },
  { role: 'BAR', slot: 2, holder: null, status: 'CANCELLED' },
]

// The night that is over, fully staffed, which is what a night report reads.
const PAST: SeedShift[] = [
  { role: 'DUTY_MANAGER', slot: 1, holder: 'rowan', status: 'CONFIRMED' },
  { role: 'DOOR', slot: 1, holder: 'noor', status: 'CONFIRMED' },
  { role: 'DOOR', slot: 2, holder: 'bram', status: 'CONFIRMED' },
  { role: 'BAR', slot: 1, holder: 'ellis', status: 'CONFIRMED' },
]

const CHECKLIST: { slug: string, phase: 'PRE' | 'POST', label: string, required: boolean, systemCheck?: string }[] = [
  { slug: 'exits', phase: 'PRE', label: 'Walk both exits and check nothing is stored in front of them', required: true },
  { slug: 'extinguishers', phase: 'PRE', label: 'Extinguishers in place and seals intact', required: true },
  { slug: 'first-aid', phase: 'PRE', label: 'First aid kit checked and the nearest defibrillator known', required: true },
  { slug: 'house-lights', phase: 'PRE', label: 'House lights and the auditorium blues tested', required: true },
  { slug: 'programmes', phase: 'PRE', label: 'Programmes and content warning cards on the door table', required: false },
  { slug: 'till-float', phase: 'PRE', label: 'Reader paired and the bar catalogue loads', required: true },
  { slug: 'holds-released', phase: 'POST', label: 'Unpaid holds released', required: true, systemCheck: 'NO_SHOW_HOLDS_RELEASED' },
  { slug: 'incidents-reviewed', phase: 'POST', label: 'Incidents reviewed', required: true, systemCheck: 'INCIDENTS_REVIEWED' },
  { slug: 'lock-up', phase: 'POST', label: 'Workshop and box locked, keys back on the hook', required: true },
  { slug: 'bins', phase: 'POST', label: 'Glasses collected and bins out', required: false },
]

export interface ShowNight {
  counts: {
    shifts: number
    incidents: number
    ageChecks: number
    checklistItems: number
    checklistStamps: number
    backstageMessages: number
  }
  // Printed once by the caller: a board join token is a credential and is never committed.
  boardTokens: { label: string, night: string, token: string }[]
}

export interface ShowNightOptions { now: number, token: () => string }

export async function seedShowNight(
  target: SeedTarget,
  people: People,
  programme: Programme,
  options: ShowNightOptions,
): Promise<ShowNight> {
  const { now, token } = options
  const house = programme.venues.get('house')!
  const officer = personIn(people, 'rowan').id
  const statements: BoundStatement[] = []

  // A house template, which is what a rota is stamped from (E-106).
  for (const [role, count] of [['DUTY_MANAGER', 1], ['DOOR', 2], ['BAR', 2]] as [string, number][]) {
    statements.push(insert('shift_templates', {
      id: seedId('template', 'house', role),
      venue_id: house,
      role,
      count,
      updated_by: officer,
      updated_at: now,
    }))
  }

  let shifts = 0
  const rotas: [string, SeedShift[]][] = [
    ['the-seagull/tonight', TONIGHT],
    ['the-seagull/next-week', NEXT_WEEK],
    ['the-seagull/past', PAST],
  ]
  for (const [key, rota] of rotas) {
    const performance = programme.performances.get(key)!
    for (const shift of rota) {
      statements.push(insert('shifts', {
        id: seedId('shift', key, shift.role, shift.slot),
        performance_id: performance.id,
        role: shift.role,
        slot: shift.slot,
        user_id: shift.holder === null ? null : personIn(people, shift.holder).id,
        status: shift.status,
        needs_review: shift.needsReview ? 1 : 0,
        assigned_by: shift.status === 'CONFIRMED' ? officer : null,
        claimed_at: shift.holder === null ? null : now - 5 * DAY,
        confirmed_at: shift.status === 'CONFIRMED' ? now - 4 * DAY : null,
        decline_reason: shift.declineReason ?? null,
        notes: shift.notes ?? null,
      }))
      shifts++
    }
  }

  // The remaining performances get an unclaimed rota, so no night is a blank screen.
  for (const [key, performance] of programme.performances) {
    if (rotas.some(([named]) => named === key)) continue
    if (performance.venueId !== house) continue
    for (const [role, count] of [['DUTY_MANAGER', 1], ['DOOR', 2], ['BAR', 2]] as [string, number][]) {
      for (let slot = 1; slot <= count; slot++) {
        statements.push(insert('shifts', {
          id: seedId('shift', key, role, slot),
          performance_id: performance.id,
          role,
          slot,
          user_id: null,
          status: 'OPEN',
        }))
        shifts++
      }
    }
  }

  for (const [sort, item] of CHECKLIST.entries()) {
    statements.push(insert('checklist_items', {
      id: seedId('checkitem', item.slug),
      venue_id: house,
      phase: item.phase,
      label: item.label,
      sort,
      required: item.required ? 1 : 0,
      system_check: item.systemCheck ?? null,
      active: 1,
      updated_by: officer,
      updated_at: now - 200 * DAY,
    }))
  }

  // A severity table with follow-up switched on for the two that matter (E-116).
  for (const [severity, followUp] of [['NOTE', 0], ['NEAR_MISS', 0], ['INCIDENT', 1], ['SERIOUS', 1]] as [string, number][]) {
    statements.push(insert('incident_severity_config', {
      severity,
      requires_follow_up: followUp,
      updated_by: officer,
      updated_at: now - 200 * DAY,
    }))
  }

  target.batch(statements)

  const stamps = seedChecklistStamps(target, people, programme, now)
  const incidents = seedIncidents(target, people, programme, now)
  const ageChecks = seedAgeChecks(target, people, programme, now)
  const backstage = await seedBackstage(target, people, programme, now, token)

  return {
    counts: {
      shifts,
      incidents,
      ageChecks,
      checklistItems: CHECKLIST.length,
      checklistStamps: stamps,
      backstageMessages: backstage.messages,
    },
    boardTokens: backstage.tokens,
  }
}

// Tonight part way through, and the night that is over closed off: the two states the screen and
// the night report each need (E-115, E-125).
function seedChecklistStamps(target: SeedTarget, people: People, programme: Programme, now: number): number {
  const officer = personIn(people, 'rowan').id
  const statements: BoundStatement[] = []
  let stamped = 0

  const performances: [string, 'PART' | 'DONE'][] = [
    [programme.performances.get('the-seagull/tonight')!.id, 'PART'],
    [programme.performances.get('the-seagull/past')!.id, 'DONE'],
  ]

  for (const [performanceId, how] of performances) {
    for (const [sort, item] of CHECKLIST.entries()) {
      // Tonight: the pre-show list ticked bar one, and nothing after the show yet.
      const ticked = how === 'DONE'
        ? item.systemCheck === undefined
        : item.phase === 'PRE' && item.slug !== 'programmes'
      const exempted = how === 'PART' && item.slug === 'programmes'

      // A system check is never hand ticked, and a tick is a person and a time together, so a
      // system row carries neither and is satisfied by the check itself.
      const byHand = ticked && item.systemCheck === undefined

      statements.push(insert('checklist_stamps', {
        id: seedId('checkstamp', performanceId, item.slug),
        performance_id: performanceId,
        item_id: seedId('checkitem', item.slug),
        phase: item.phase,
        label: item.label,
        sort,
        required: item.required ? 1 : 0,
        system_check: item.systemCheck ?? null,
        ticked_by: byHand ? officer : null,
        ticked_at: byHand ? now - (how === 'DONE' ? 6 * DAY : 2 * 3600) : null,
        exempted: exempted ? 1 : 0,
        exempt_reason: exempted ? 'The programmes did not arrive from the printer.' : null,
        exempted_by: exempted ? officer : null,
        exempted_at: exempted ? now - 3600 : null,
      }))
      stamped++
    }
  }

  // Only the performance that is over is closed; tonight's is still open, which is the point.
  statements.push(insert('checklist_closes', {
    id: seedId('checkclose', performances[1]![0]),
    performance_id: performances[1]![0],
    closed_by: officer,
    closed_at: now - 6 * DAY + 4 * 3600,
  }))

  target.batch(statements)
  return stamped
}

interface SeedIncident {
  slug: string
  performance: string
  reporter: string
  category: 'MEDICAL' | 'BEHAVIOUR' | 'SAFETY' | 'SECURITY' | 'PROPERTY' | 'OTHER'
  severity: 'NOTE' | 'NEAR_MISS' | 'INCIDENT' | 'SERIOUS'
  body: string
  hoursAgo: number
  supersedes?: string
  closure?: string
}

const INCIDENTS: SeedIncident[] = [
  { slug: 'spilled-drink', performance: 'the-seagull/tonight', reporter: 'priya', category: 'PROPERTY', severity: 'NOTE', body: 'A pint went over in the foyer before the house opened. Mopped, and the floor sign is out.', hoursAgo: 3 },
  { slug: 'near-miss-flat', performance: 'the-seagull/tonight', reporter: 'devon', category: 'SAFETY', severity: 'NEAR_MISS', body: 'A flat was leaning unbraced stage right during the get-in. Braced before anybody was near it.', hoursAgo: 5 },
  { slug: 'fainted', performance: 'the-seagull/past', reporter: 'rowan', category: 'MEDICAL', severity: 'INCIDENT', body: 'A patron fainted in the second act. Sat out in the foyer with water, went home with a friend, declined an ambulance.', hoursAgo: 6 * 24, closure: 'Followed up by telephone the next day. No further care needed, and the house was warm rather than the patron unwell. Fan ordered for the foyer.' },
  { slug: 'ejected', performance: 'the-seagull/past', reporter: 'noor', category: 'BEHAVIOUR', severity: 'SERIOUS', body: 'A member of the audience was asked to leave after refusing to stop filming and becoming aggressive to the door team.', hoursAgo: 6 * 24 + 1 },
  // A correction supersedes rather than edits, which is the shape every append-only register uses.
  { slug: 'ejected-corrected', performance: 'the-seagull/past', reporter: 'noor', category: 'BEHAVIOUR', severity: 'INCIDENT', body: 'Correcting the severity: the patron left when asked and was not aggressive to the team. The filming refusal stands.', hoursAgo: 6 * 24 - 2, supersedes: 'ejected' },
]

function seedIncidents(target: SeedTarget, people: People, programme: Programme, now: number): number {
  const statements: BoundStatement[] = []

  for (const incident of INCIDENTS) {
    const id = seedId('incident', incident.slug)
    if (holds(target, 'incidents', { id })) continue

    statements.push(insertOnly('incidents', {
      id,
      performance_id: programme.performances.get(incident.performance)!.id,
      reported_by: personIn(people, incident.reporter).id,
      category: incident.category,
      severity: incident.severity,
      body: incident.body,
      happened_at: now - incident.hoursAgo * 3600,
      supersedes_id: incident.supersedes ? seedId('incident', incident.supersedes) : null,
    }))

    if (incident.closure) {
      statements.push(insertOnly('incident_followup_closures', {
        id: seedId('closure', incident.slug),
        incident_id: id,
        resolution_note: incident.closure,
        closed_by: personIn(people, 'aoife').id,
        closed_at: now - (incident.hoursAgo - 20) * 3600,
      }))
    }
  }

  if (statements.length) target.batch(statements)
  return INCIDENTS.length
}

interface SeedAgeCheck {
  slug: string
  performance: string | null
  checker: string
  outcome: 'ACCEPTED' | 'REFUSED'
  idType?: 'PASSPORT' | 'DRIVING_LICENCE' | 'PASS_CARD' | 'OTHER'
  reason?: 'NO_ID_SHOWN' | 'ID_LOOKED_FALSE' | 'APPEARED_UNDERAGE' | 'OTHER'
  description: string
  product?: string
  notes?: string
  hoursAgo: number
  supersedes?: string
}

// Both outcomes, both shapes the CHECK allows, and one recorded away from any performance.
const AGE_CHECKS: SeedAgeCheck[] = [
  { slug: 'accepted-passport', performance: 'the-seagull/tonight', checker: 'devon', outcome: 'ACCEPTED', idType: 'PASSPORT', description: 'Fair hair, denim jacket, ordered at the interval', product: 'Lager, can', hoursAgo: 2 },
  { slug: 'accepted-licence', performance: 'the-seagull/tonight', checker: 'devon', outcome: 'ACCEPTED', idType: 'DRIVING_LICENCE', description: 'Tall, in a red scarf', product: 'House red, 175ml glass', hoursAgo: 2 },
  { slug: 'refused-no-id', performance: 'the-seagull/tonight', checker: 'devon', outcome: 'REFUSED', reason: 'NO_ID_SHOWN', description: 'Group of three at the bar, one with no identification', product: 'Gin, double', notes: 'Offered a soft drink instead, which was taken.', hoursAgo: 1 },
  { slug: 'refused-underage', performance: 'the-seagull/past', checker: 'ellis', outcome: 'REFUSED', reason: 'APPEARED_UNDERAGE', description: 'School uniform under a coat', product: 'Lager, can', hoursAgo: 6 * 24 },
  { slug: 'refused-false-id', performance: null, checker: 'ellis', outcome: 'REFUSED', reason: 'ID_LOOKED_FALSE', description: 'Card was the wrong weight and the hologram was printed', hoursAgo: 30 * 24 },
  { slug: 'refused-corrected', performance: 'the-seagull/past', checker: 'ellis', outcome: 'ACCEPTED', idType: 'PASS_CARD', description: 'Correction: a PASS card was produced on a second visit to the bar', hoursAgo: 6 * 24 - 1, supersedes: 'refused-underage' },
]

function seedAgeChecks(target: SeedTarget, people: People, programme: Programme, now: number): number {
  const statements: BoundStatement[] = []

  for (const check of AGE_CHECKS) {
    const id = seedId('agecheck', check.slug)
    if (holds(target, 'age_checks', { id })) continue

    statements.push(insertOnly('age_checks', {
      id,
      performance_id: check.performance === null ? null : programme.performances.get(check.performance)!.id,
      checked_by: personIn(people, check.checker).id,
      outcome: check.outcome,
      id_type: check.idType ?? null,
      reason: check.reason ?? null,
      description: check.description,
      product: check.product ?? null,
      notes: check.notes ?? null,
      supersedes_id: check.supersedes ? seedId('agecheck', check.supersedes) : null,
      created_at: now - check.hoursAgo * 3600,
    }))
  }

  if (statements.length) target.batch(statements)
  return AGE_CHECKS.length
}

// SHA-256 hex, the same digest `server/utils/backstage.ts` stores, so a printed join token is one
// that actually rejoins rather than a hash of nothing.
async function hashToken(plaintext: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(plaintext))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export interface Backstage { messages: number, tokens: { label: string, night: string, token: string }[] }

// The board tonight and the night that is over, at the milestones a real night calls. A device's
// join token is generated per run and printed once, because it is a credential (E-121).
async function seedBackstage(
  target: SeedTarget,
  people: People,
  programme: Programme,
  now: number,
  token: () => string,
): Promise<Backstage> {
  const house = programme.venues.get('house')!
  const officer = personIn(people, 'rowan').id
  const statements: BoundStatement[] = []

  // The labels the migration already ships, adopted rather than duplicated: the unique index is
  // on the label, so inventing a parallel vocabulary silently seeds nothing.
  const milestones = ['Clearance', 'House open', 'Curtain up', 'Interval', 'Restart', 'End']
  const milestoneId = new Map<string, string>()
  for (const [sort, label] of milestones.entries()) {
    milestoneId.set(label, ensure(target, 'backstage_milestone_types', { column: 'label', value: label }, {
      id: seedId('milestone', label),
      label,
      sort,
      active: 1,
      updated_by: officer,
      updated_at: now - 200 * DAY,
    }).id)
  }

  const presets: [string, string, number][] = [
    ['Standby', 'Standby please.', 0],
    ['Hold', 'Hold the show, front of house are dealing with something.', 1],
    ['Clear', 'Clear to continue.', 2],
    ['Ambulance', 'An ambulance has been called. Duty manager to the foyer.', 3],
  ]
  for (const [label, body, sort] of presets) {
    ensure(target, 'backstage_presets', { column: 'label', value: label }, {
      id: seedId('preset', label),
      label,
      body,
      sort,
      active: 1,
      updated_by: officer,
      updated_at: now - 200 * DAY,
    })
  }

  let messages = 0
  const tokens: Backstage['tokens'] = []
  const nights: [string, number, number][] = [
    [programme.performances.get('the-seagull/tonight')!.night, 2, 1],
    [programme.performances.get('the-seagull/past')!.night, 5, 6 * 24],
  ]

  for (const [night, reached, hoursAgo] of nights) {
    const nightId = seedId('backstagenight', night)
    statements.push(insert('backstage_nights', {
      id: nightId,
      venue_id: house,
      night,
      epoch: 0,
      failed_attempts: 0,
    }))

    // One device per station, so a message has a sender and an acknowledgement has a reader.
    const devices: { id: string, label: string }[] = []
    for (const label of ['Prompt corner', 'Dressing room']) {
      const deviceId = seedId('backstagedevice', night, label)
      const held = holds(target, 'backstage_devices', { id: deviceId })
      if (!held) {
        const plaintext = token()
        statements.push(insert('backstage_devices', {
          id: deviceId,
          night_id: nightId,
          label,
          token_hash: await hashToken(plaintext),
          joined_epoch: 0,
          joined_at: now - hoursAgo * 3600,
          last_seen_at: now - hoursAgo * 3600 + 600,
        }))
        tokens.push({ label, night, token: plaintext })
      }
      devices.push({ id: deviceId, label })
    }

    for (const [index, label] of milestones.slice(0, reached).entries()) {
      const messageId = seedId('backstagemessage', night, label)
      const at = now - hoursAgo * 3600 - (reached - index) * 900
      statements.push(insert('backstage_messages', {
        id: messageId,
        night_id: nightId,
        device_id: devices[0]!.id,
        milestone_type_id: milestoneId.get(label)!,
        body: `${label} called.`,
        composed_at: at,
        created_at: at,
      }))
      statements.push(insert('backstage_acknowledgements', {
        id: seedId('backstageack', night, label),
        message_id: messageId,
        device_id: devices[1]!.id,
        acknowledged_at: at + 30,
      }))
      messages++
    }
  }

  target.batch(statements)
  return { messages, tokens }
}
