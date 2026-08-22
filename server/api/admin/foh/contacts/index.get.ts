import { db, schema } from '@nuxthub/db'
import { asc } from 'drizzle-orm'
import { manageFohReference } from '~~/shared/utils/abilities'

/** GET /api/admin/foh/contacts: the contact list, archived rows included. */
export default defineEventHandler(async (event) => {
  await authorize(event, manageFohReference)

  return db.select().from(schema.fohContacts)
    .orderBy(asc(schema.fohContacts.sort), asc(schema.fohContacts.label))
})
