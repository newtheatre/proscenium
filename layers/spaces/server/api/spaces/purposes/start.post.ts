// Makes a starting list of purposes, only while there are none (SP-07).
import { z } from 'zod'
import { defineRoute } from '#kit'
import { startPurposes } from '../../../setup'
import { STARTING_LISTS } from '../../../../shared/setup'

export default defineRoute({
  ability: 'spaces.purpose.manage',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ list: z.enum(STARTING_LISTS) }).strict(),
}, (_event, { input, unit }) => ({ made: startPurposes(unit.view(), input.list) }))
