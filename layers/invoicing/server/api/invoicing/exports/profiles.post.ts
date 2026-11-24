// Makes an export profile from a starting layout (IE-02): the journal, or the students' union return.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { profileFields, STARTERS } from '../../../../shared/exports'
import { createProfile } from '../../../profiles'

export default defineRoute({
  ability: 'invoicing.export.manage',
  rateLimit: 'write',
  input: z.object({ starter: z.enum(STARTERS), name: profileFields.name.optional() }).strict(),
}, async (_event, { input, unit }) => ({ id: await createProfile(unit, input) }))
