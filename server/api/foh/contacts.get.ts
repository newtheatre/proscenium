import { db, schema } from '@nuxthub/db'
import { and, asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { workFoh } from '~~/shared/utils/abilities'

const querySchema = z.object({ performanceId: z.string().trim().min(1) })

/** GET /api/foh/contacts — who is on tonight, and the numbers to call. */
export default defineEventHandler(async (event) => {
  await authorize(event, workFoh)

  const { user } = await requireUserSession(event)
  const scope = await requireFohScope(user)
  const { performanceId } = await getValidatedQuery(event, querySchema.parse)
  scopedPerformance(scope, performanceId)

  // Names and roles only: the mirror holds no phone numbers, and a colleague's
  // email is not the door's business. Numbers live in the admin list below.
  const onTonight = await db.select({
    role: schema.performanceShifts.role,
    name: schema.users.name,
  })
    .from(schema.performanceShifts)
    .innerJoin(schema.users, eq(schema.performanceShifts.userId, schema.users.id))
    .where(and(
      eq(schema.performanceShifts.performanceId, performanceId),
      eq(schema.performanceShifts.status, 'CONFIRMED'),
    ))
    .orderBy(asc(schema.performanceShifts.role))

  const contacts = await db.select({
    id: schema.fohContacts.id,
    label: schema.fohContacts.label,
    phone: schema.fohContacts.phone,
    kind: schema.fohContacts.kind,
    note: schema.fohContacts.note,
  })
    .from(schema.fohContacts)
    .where(eq(schema.fohContacts.archived, false))
    .orderBy(asc(schema.fohContacts.sort), asc(schema.fohContacts.label))

  return { onTonight, contacts }
})
