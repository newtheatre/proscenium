import { eq } from 'drizzle-orm'
import { PERSONAS, PERSONA_PASSWORD } from '#shared/utils/personas'

// Development-only helpers (K-124). Every caller is guarded, and nuxt.config keeps the routes out
// of a production build entirely rather than trusting a guard to be remembered.

const MAILBOX = '.data/mail'

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
const MAP = '.data/personas.json'

async function remembered(): Promise<Record<string, string>> {
  try {
    return await Bun.file(MAP).json() as Record<string, string>
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

// Seeds one account per persona, idempotently: running it twice changes nothing, because a
// developer runs it whenever they are unsure rather than once.
export async function seedPersonas(): Promise<{ made: number, held: number }> {
  const map = await remembered()
  let made = 0
  let held = 0

  for (const persona of PERSONAS) {
    const known = map[persona.email]
    if ((known && await findById(known)) || await findByEmail(persona.email)) {
      held++
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
    if (persona.shape === 'tombstone') await eraseAccount(id, null)
  }

  await Bun.write(MAP, JSON.stringify(map, null, 2))
  return { made, held }
}
