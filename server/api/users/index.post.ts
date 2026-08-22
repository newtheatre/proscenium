import { db, schema } from '@nuxthub/db'
import { z } from 'zod'
import { createUser } from '~~/shared/utils/abilities'

const bodySchema = z.object({
  email: z.email(),
  name: z.string().min(1, 'Name is required'),
})

/**
 * POST /api/users: create a user to attach a reservation to (staff).
 */
export default defineEventHandler(async (event) => {
  await authorize(event, createUser)

  const { email, name } = await readValidatedBody(event, bodySchema.parse)

  const config = useRuntimeConfig(event)
  if (!config.authServiceToken) {
    throw createError({ statusCode: 502, statusMessage: 'Auth service token not configured' })
  }

  let shadow: { id: string, existing: boolean, guest: boolean }
  try {
    shadow = await $fetch<{ id: string, existing: boolean, guest: boolean }>(
      `${config.public.authBaseURL}/api/users/shadow`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.authServiceToken}` },
        body: { email, name },
      },
    )
  }
  catch (error) {
    console.error('[users] shadow-account call failed:', error)
    throw createError({ statusCode: 502, statusMessage: 'Could not reach the auth service, try again' })
  }

  const [user] = await db.insert(schema.users)
    .values({ id: shadow.id, email: email.toLowerCase(), name })
    .onConflictDoUpdate({
      target: schema.users.id,
      set: { email: email.toLowerCase(), name },
    })
    .returning()

  return { user: { ...user!, existing: shadow.existing } }
})
