import { eq } from 'drizzle-orm'
// The writer's own constant, so the tools cannot read a path the centre stopped writing to.
import { MAILBOX } from './mailbox'
import { PERSONAS, PERSONA_PASSWORD, PERSONA_TOTP_SECRET } from '#shared/utils/personas'

// Development-only helpers (K-124). Every caller is guarded, and nuxt.config keeps the routes out
// of a production build entirely rather than trusting a guard to be remembered.

// Beside the database they describe, so a run against a throwaway hub directory does not read a
// map written for the developer's own one.
const DEV_DIR = process.env.NUXT_HUB_DIR ?? '.data'

export interface Letter { name: string, to: string, subject: string, body: string }

// The messages the notification centre wrote here instead of sending (0013).
export async function mailbox(): Promise<Letter[]> {
  const { readdir, readFile } = await import('node:fs/promises')
  try {
    const names = (await readdir(MAILBOX)).sort().reverse().slice(0, 20)
    return await Promise.all(names.map(async (name) => {
      const body = await readFile(`${MAILBOX}/${name}`, 'utf8')
      const header = (label: string): string => body.match(new RegExp(`^${label}: (.*)$`, 'm'))?.[1] ?? ''
      return { name, to: header('To'), subject: header('Subject'), body }
    }))
  }
  catch {
    return []
  }
}

// Which account each persona became. Anonymisation rewrites the email, so a tombstone cannot be
// found by the address it was seeded under; this map is how it stays findable (0011).
const MAP = `${DEV_DIR}/personas.json`

async function remembered(): Promise<Record<string, string>> {
  const { readFile } = await import('node:fs/promises')
  try {
    return JSON.parse(await readFile(MAP, 'utf8')) as Record<string, string>
  }
  catch {
    return {}
  }
}

export interface PersonaAccount { id: string, email: string, name: string, anonymisedAt: number | null }

// The seeded account for each persona email, or nothing where one has not been seeded yet.
export async function personaAccounts(): Promise<Map<string, PersonaAccount>> {
  const map = await remembered()
  const found = new Map<string, PersonaAccount>()

  for (const persona of PERSONAS) {
    const id = map[persona.email]
    if (!id) continue
    const account = await findById(id)
    if (account) found.set(persona.email, { id: account.id, email: account.email, name: account.name, anonymisedAt: account.anonymisedAt })
  }
  return found
}

// Idempotent on a made or a held persona alike (#927): a persona whose row lacks one must not
// stay stuck needing an authenticator app forever just because seeding found it already there.
async function confirmSecondFactor(userId: string): Promise<void> {
  await db.insert(schema.totpSecrets).values({
    userId,
    secret: PERSONA_TOTP_SECRET,
    confirmedAt: Math.floor(Date.now() / 1000),
  }).onConflictDoNothing()
}

// The persona accounts only, idempotently. The rest of the seed is `bun run seed`, which cannot
// run from here: its builders read as they write, and D1 in a worker is async (operations.md).
export async function seedPersonas(): Promise<{ made: number, held: number }> {
  const map = await remembered()
  let made = 0
  let held = 0

  for (const persona of PERSONAS) {
    const known = map[persona.email]
    const existing = (known && await findById(known)) || await findByEmail(persona.email)
    if (existing) {
      // Recorded even when this run did not make it: `bun run seed` writes the same personas, and
      // an erased one cannot be found by its address afterwards (0011).
      map[persona.email] = existing.id
      held++
      // A database seeded before the factor was added to this branch still holds this persona
      // without one (#927): a held persona needs it just as much as a freshly made one.
      if (persona.shape === 'full') await confirmSecondFactor(existing.id)
      continue
    }

    const id = await createAccount({
      email: persona.email,
      name: persona.name,
      passwordHash: persona.shape === 'guest' ? null : await hashPassword(PERSONA_PASSWORD),
    })
    map[persona.email] = id
    made++

    if (persona.shape !== 'guest') {
      await db.update(schema.users).set({ verified: true }).where(eq(schema.users.id, id))
    }
    if (persona.role) {
      await db.insert(schema.roleGrants).values({
        id: newId(),
        userId: id,
        role: persona.role,
        expiresAt: defaultRoleExpiry(new Date()),
      }).onConflictDoNothing()
    }
    // Confirmed outright: a privileged role needs a second factor (A-112), and re-enrolling one
    // by hand every reseed is exactly what this file exists to save (K-124 criterion 1).
    if (persona.shape === 'full') await confirmSecondFactor(id)
    if (persona.shape === 'tombstone') await eraseAccount(id, null)
  }

  const { mkdir, writeFile } = await import('node:fs/promises')
  await mkdir(DEV_DIR, { recursive: true })
  await writeFile(MAP, JSON.stringify(map, null, 2))
  return { made, held }
}
