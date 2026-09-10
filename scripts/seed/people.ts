// The society's membership, in every state a screen has to cope with: current, lapsed, never a
// member, unverified, disabled, guest and tombstone. One body of data, read by both seed doors.

import { erasureStatements } from '../../shared/utils/erasure'
import { PERSONAS, PERSONA_PASSWORD } from '../../shared/utils/personas'
import { defaultRoleExpiry } from '../../shared/utils/roles'
import { boundFromSQL, holds, insert, seedId } from './statements'
import type { BoundStatement, SeedTarget } from './statements'

// Obviously synthetic and stable across runs, so a re-run adopts the account it made last time
// rather than leaving a second one beside it. A subdomain of ours, which registration accepts.
const DOMAIN = 'e2e.newtheatre.org.uk'

export function seedAddress(slug: string): string {
  return `seed-${slug}@${DOMAIN}`.toLowerCase()
}

export type Membership = 'CURRENT' | 'LAPSED' | 'UNCONFIRMED' | 'NONE'

export interface SeedPerson {
  slug: string
  name: string
  pronouns?: string
  membership: Membership
  verified?: false
  disabled?: true
  // No password at all, which is what guest checkout leaves behind (A-116).
  guest?: true
  roles?: { role: string, when: 'CURRENT' | 'EXPIRING' | 'LAPSED' | 'FOREVER' }[]
}

// Named so nobody mistakes one for a member, and spread across the states rather than clustered:
// a screen that only ever sees a current member is a screen nobody has tested.
export const PEOPLE: SeedPerson[] = [
  { slug: 'rowan', name: 'Rowan Ellis (test)', pronouns: 'she/her', membership: 'CURRENT', roles: [{ role: 'COMMITTEE', when: 'CURRENT' }] },
  { slug: 'priya', name: 'Priya Nair (test)', pronouns: 'she/her', membership: 'CURRENT', roles: [{ role: 'FRONT_OF_HOUSE', when: 'CURRENT' }] },
  { slug: 'tomasz', name: 'Tomasz Zielinski (test)', pronouns: 'he/him', membership: 'CURRENT', roles: [{ role: 'FRONT_OF_HOUSE', when: 'EXPIRING' }] },
  { slug: 'aoife', name: 'Aoife Brennan (test)', pronouns: 'she/her', membership: 'CURRENT', roles: [{ role: 'SAFETY_OFFICER', when: 'CURRENT' }] },
  { slug: 'sam', name: 'Sam Okonkwo (test)', pronouns: 'they/them', membership: 'CURRENT', roles: [{ role: 'THEATRE_MANAGER', when: 'LAPSED' }] },
  { slug: 'iris', name: 'Iris Fairweather (test)', membership: 'CURRENT', roles: [{ role: 'COMMITTEE', when: 'FOREVER' }] },
  { slug: 'devon', name: 'Devon Achebe (test)', pronouns: 'he/him', membership: 'CURRENT' },
  { slug: 'mira', name: 'Mira Halvorsen (test)', membership: 'CURRENT' },
  { slug: 'jonah', name: 'Jonah Whitlock (test)', pronouns: 'he/him', membership: 'CURRENT' },
  { slug: 'kavya', name: 'Kavya Raghunathan (test)', membership: 'CURRENT' },
  { slug: 'ellis', name: 'Ellis Trewin (test)', pronouns: 'they/them', membership: 'CURRENT' },
  { slug: 'noor', name: 'Noor Haddad (test)', membership: 'CURRENT' },
  { slug: 'bram', name: 'Bram Kowalczyk (test)', pronouns: 'he/him', membership: 'CURRENT' },

  // The awkward ones, which is why they are here at all.
  { slug: 'lapsed', name: 'Lena Pastdue (test)', membership: 'LAPSED' },
  { slug: 'lapsed-two', name: 'Otto Wintergone (test)', membership: 'LAPSED' },
  { slug: 'unconfirmed', name: 'Pim Awaiting (test)', membership: 'UNCONFIRMED' },
  { slug: 'nonmember', name: 'Cass Neverjoined (test)', membership: 'NONE' },
  { slug: 'unverified', name: 'Wren Unproven (test)', membership: 'NONE', verified: false },
  { slug: 'disabled', name: 'Gil Shutout (test)', membership: 'LAPSED', disabled: true },
  { slug: 'checkout-guest', name: 'Bee Passerby (test)', membership: 'NONE', guest: true },
]

export interface SeededPerson {
  slug: string
  email: string
  name: string
  id: string
  password: string | null
  // A persona's password is the committed development constant, not a generated one, so a caller
  // printing credentials can tell the two apart (K-124).
  persona: boolean
}

// The account map every other module keys off, by slug for the seed's own people and by email for
// the personas the developer tools already know.
export interface People {
  bySlug: Map<string, SeededPerson>
  byEmail: Map<string, SeededPerson>
  order: SeededPerson[]
}

export function personIn(people: People, slug: string): SeededPerson {
  const found = people.bySlug.get(slug)
  if (!found) throw new Error(`the seed has no person "${slug}"`)
  return found
}

export interface PeopleOptions {
  // Injected because a script cannot reach nuxt-auth-utils, and both doors must hash alike.
  hash: (password: string) => Promise<string>
  password: () => string
  now: number
}

const DAY = 86_400

function membershipRow(userId: string, membership: Membership, now: number): BoundStatement | null {
  if (membership === 'NONE') return null

  const spans = {
    CURRENT: { starts: -60, expires: 300, confirmed: now - 60 * DAY },
    LAPSED: { starts: -430, expires: -65, confirmed: now - 430 * DAY },
    UNCONFIRMED: { starts: -3, expires: 360, confirmed: null },
  }[membership]

  return insert('memberships', {
    id: seedId('membership', userId),
    user_id: userId,
    starts_on: dayOffset(now, spans.starts),
    expires_on: dayOffset(now, spans.expires),
    source: membership === 'UNCONFIRMED' ? 'ROSTER' : 'MANUAL',
    confirmed_at: spans.confirmed,
    confirmed_by: null,
  })
}

// A London date offset by whole days. Every domain date is a London day (0014).
export function dayOffset(now: number, days: number): string {
  return new Date((now + days * DAY) * 1000).toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

function grantExpiry(when: string, now: number): number | null {
  if (when === 'FOREVER') return null
  if (when === 'EXPIRING') return now + 7 * DAY
  if (when === 'LAPSED') return now - 30 * DAY
  return defaultRoleExpiry(new Date(now * 1000))
}

// An account per person, plus the personas the developer tools list. A re-run refreshes the
// password it prints and touches nothing else, because that is the only value it cannot recover.
export async function seedPeople(target: SeedTarget, options: PeopleOptions): Promise<People> {
  const { hash, password, now } = options
  const people: People = { bySlug: new Map(), byEmail: new Map(), order: [] }

  for (const persona of PERSONAS) {
    const seeded = await account(target, {
      slug: persona.email.replace(/@.*$/, ''),
      email: persona.email,
      name: persona.name,
      pronouns: null,
      // The dev personas keep a fixed password so the ordinary sign-in form can be used without
      // looking a fresh one up; `/dev` signs in as any of them without one at all (K-124).
      password: persona.shape === 'guest' ? null : PERSONA_PASSWORD,
      persona: true,
      verified: persona.shape !== 'guest',
      disabled: false,
      hash,
      now,
    })
    people.byEmail.set(persona.email, seeded)
    people.order.push(seeded)

    if (persona.role) {
      target.batch([insert('role_grants', {
        id: seedId('grant', seeded.id, persona.role),
        user_id: seeded.id,
        role: persona.role,
        expires_at: defaultRoleExpiry(new Date(now * 1000)),
        granted_by: null,
        note: 'Seeded persona (K-124).',
      })])
    }

    // Anonymised last, and only once: the tombstone guard refuses any later write over it (0011).
    if (persona.shape === 'tombstone' && !isTombstone(target, seeded.id)) {
      target.batch(boundFromSQL(erasureStatements(seeded.id, now)))
    }
  }

  for (const person of PEOPLE) {
    const secret = person.guest ? null : password()
    const seeded = await account(target, {
      slug: person.slug,
      email: seedAddress(person.slug),
      name: person.name,
      pronouns: person.pronouns ?? null,
      password: secret,
      persona: false,
      verified: person.verified !== false,
      disabled: person.disabled === true,
      hash,
      now,
    })
    people.bySlug.set(person.slug, seeded)
    people.byEmail.set(seeded.email, seeded)
    people.order.push(seeded)

    const membership = membershipRow(seeded.id, person.membership, now)
    if (membership) target.batch([membership])

    for (const grant of person.roles ?? []) {
      target.batch([insert('role_grants', {
        id: seedId('grant', seeded.id, grant.role),
        user_id: seeded.id,
        role: grant.role,
        expires_at: grantExpiry(grant.when, now),
        granted_by: null,
        note: 'Seeded membership fixture.',
      })])
    }
  }

  return people
}

function isTombstone(target: SeedTarget, userId: string): boolean {
  return Boolean(target.get<{ id: string }>('SELECT id FROM users WHERE id = ? AND anonymised_at IS NOT NULL', userId))
}

interface AccountInput {
  slug: string
  persona: boolean
  email: string
  name: string
  pronouns: string | null
  password: string | null
  verified: boolean
  disabled: boolean
  hash: (password: string) => Promise<string>
  now: number
}

async function account(target: SeedTarget, input: AccountInput): Promise<SeededPerson> {
  const held = target.get<{ id: string, anonymised_at: number | null }>(
    'SELECT id, anonymised_at FROM users WHERE email = ?',
    input.email,
  )

  const id = held?.id ?? seedId('user', input.slug)
  const hashed = input.password === null ? null : await input.hash(input.password)

  if (!held) {
    target.batch([insert('users', {
      id,
      email: input.email,
      name: input.name,
      pronouns: input.pronouns,
      password: hashed,
      password_set_at: hashed === null ? null : input.now,
      verified: input.verified ? 1 : 0,
      disabled: input.disabled ? 1 : 0,
    })])
  }
  // A tombstone is never written back over, and an account already there keeps everything but the
  // password, which is the one value a re-run has to be able to print again.
  else if (held.anonymised_at === null && hashed !== null) {
    target.batch([['UPDATE users SET password = ?, password_set_at = ? WHERE id = ? AND anonymised_at IS NULL', hashed, input.now, id]])
  }

  return { slug: input.slug, email: input.email, name: input.name, id, password: input.password, persona: input.persona }
}

// The rest of a person: what they told us, what they chose, and what an officer recorded.
export function seedPersonDetail(target: SeedTarget, people: People, now: number): void {
  const statements: BoundStatement[] = []

  const contacts: [string, string, string, string][] = [
    ['rowan', 'Marguerite Ellis', '07700 900111', 'Mother'],
    ['aoife', 'Declan Brennan', '07700 900222', 'Brother'],
    ['priya', 'Anil Nair', '07700 900333', 'Father'],
  ]
  for (const [slug, name, phone, relation] of contacts) {
    statements.push(insert('emergency_contacts', {
      user_id: personIn(people, slug).id,
      name,
      phone,
      relation,
    }))
  }

  // Visible on the rota to whoever shares a shift, which is opt-in and off by default (E-105).
  for (const slug of ['rowan', 'priya', 'aoife']) {
    statements.push(insert('shift_contact_preferences', {
      user_id: personIn(people, slug).id,
      visible: 1,
    }))
  }

  const topics = ['BOOKINGS', 'SHIFTS', 'TRAINING', 'ROOMS', 'ANNOUNCEMENTS']
  for (const [index, slug] of ['rowan', 'devon', 'mira'].entries()) {
    for (const topic of topics) {
      // One person has muted the announcements, so a preference screen shows a real choice.
      statements.push(insert('notification_preferences', {
        user_id: personIn(people, slug).id,
        topic,
        email: index === 2 && topic === 'ANNOUNCEMENTS' ? 0 : 1,
        push: 0,
      }))
    }
  }

  // Every state the roll of Fellows has, including one revoked, so the screen shows both (J-103).
  const fellows: [string, number, string, boolean][] = [
    ['iris', -900, 'For twenty years of quietly making the lighting rig work.', false],
    ['sam', -1300, 'For the 2019 season, and for teaching half the committee to rig.', false],
    ['lapsed-two', -1600, 'Awarded in error and withdrawn at the holder\'s own request.', true],
  ]
  for (const [slug, days, citation, revoked] of fellows) {
    const person = personIn(people, slug)
    statements.push(insert('fellowships', {
      id: seedId('fellowship', person.slug),
      user_id: person.id,
      awarded_on: dayOffset(now, days),
      awarded_by: personIn(people, 'rowan').id,
      citation,
      revoked_at: revoked ? now - 200 * DAY : null,
      revoked_by: revoked ? personIn(people, 'rowan').id : null,
      revocation_reason: revoked ? 'Withdrawn at the holder\'s request.' : null,
    }))
  }

  target.batch(statements)

  // Declarations in every status, with no payload: the real ones are encrypted at rest and a seed
  // holds no key, so what is seeded is the lifecycle and never the content (D-127).
  const profiles: [string, string, number, boolean][] = [
    ['devon', 'VERIFIED', 1, true],
    ['mira', 'PENDING', 0, false],
    ['jonah', 'EXPIRED', 1, true],
    ['kavya', 'DECLINED', 0, false],
    ['ellis', 'WITHDRAWN', 2, true],
  ]
  const profileRows: BoundStatement[] = []
  for (const [slug, status, companions, consented] of profiles) {
    const person = personIn(people, slug)
    if (holds(target, 'access_profiles', { user_id: person.id })) continue
    profileRows.push(insert('access_profiles', {
      user_id: person.id,
      status,
      companions,
      consent_foh_at: consented ? now - 40 * DAY : null,
      verified_by: status === 'VERIFIED' || status === 'EXPIRED' ? personIn(people, 'aoife').id : null,
      verified_at: status === 'VERIFIED' || status === 'EXPIRED' ? now - 40 * DAY : null,
      expires_at: status === 'EXPIRED' ? now - 5 * DAY : status === 'VERIFIED' ? now + 300 * DAY : null,
      withdrawn_at: status === 'WITHDRAWN' ? now - 10 * DAY : null,
    }))
  }
  if (profileRows.length) target.batch(profileRows)
}
