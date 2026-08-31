import { eq } from 'drizzle-orm'
import type { profileForm } from '#shared/utils/profile'
import type { AccountRow } from '#server/utils/accounts'
import type { z } from 'zod'

// Reading and writing one person's own profile. A name change needs no fan-out: every module
// refers to this row, so changing it here changes it everywhere (A-114 criterion 5).

export type ProfileInput = z.output<typeof profileForm>

export interface Profile {
  name: string
  pronouns: string | null
  phone: string | null
  email: string
  emergencyName: string | null
  emergencyPhone: string | null
  emergencyRelation: string | null
}

export async function profileFor(account: AccountRow): Promise<Profile> {
  const [contact] = await db.select({
    name: schema.emergencyContacts.name,
    phone: schema.emergencyContacts.phone,
    relation: schema.emergencyContacts.relation,
  })
    .from(schema.emergencyContacts)
    .where(eq(schema.emergencyContacts.userId, account.id))
    .limit(1)

  return {
    name: account.name,
    pronouns: account.pronouns,
    phone: account.phone,
    email: account.email,
    emergencyName: contact?.name ?? null,
    emergencyPhone: contact?.phone ?? null,
    emergencyRelation: contact?.relation ?? null,
  }
}

export async function saveProfile(account: AccountRow, input: ProfileInput): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  const before = await profileFor(account)

  const person = db.update(schema.users)
    .set({ name: input.name, pronouns: input.pronouns, phone: input.phone, updatedAt: now })
    .where(eq(schema.users.id, account.id))

  // Cleared rather than emptied: a contact with no name is nobody, and the row would otherwise
  // sit there looking like an answer.
  const contact = input.emergencyName === null
    ? db.delete(schema.emergencyContacts).where(eq(schema.emergencyContacts.userId, account.id))
    : db.insert(schema.emergencyContacts)
        .values({
          userId: account.id,
          name: input.emergencyName,
          phone: input.emergencyPhone!,
          relation: input.emergencyRelation,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: schema.emergencyContacts.userId,
          set: { name: input.emergencyName, phone: input.emergencyPhone!, relation: input.emergencyRelation, updatedAt: now },
        })

  await db.batch([
    person,
    contact,
    db.insert(schema.auditLog).values(auditEntry({
      actorId: account.id,
      action: 'account.profile.updated',
      target: `user:${account.id}`,
      // Which fields, never their values: a trail is not a copy of the thing it records (0011).
      detail: { fields: changedFields(before, input) },
    })),
  ])
}

const COMPARED = ['name', 'pronouns', 'phone', 'emergencyName', 'emergencyPhone', 'emergencyRelation'] as const

function changedFields(before: Profile, input: ProfileInput): string[] {
  return COMPARED.filter(field => before[field] !== input[field])
}
