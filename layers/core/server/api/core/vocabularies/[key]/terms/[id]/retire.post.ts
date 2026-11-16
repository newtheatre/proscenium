// Retires a term (C-21): gone from every picker, still shown on the records that use it.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { retireTerm } from '../../../../../../vocabularies/service'

export default defineRoute({
  ability: 'core.vocabulary.manage',
  record: event => ['core.vocabulary', getRouterParam(event, 'key')],
  rateLimit: 'write',
  input: z.object({}),
}, async (event, { unit, record }) => {
  const id = getRouterParam(event, 'id') ?? ''
  await retireTerm(unit, record!.id, id)
  return { id }
})
