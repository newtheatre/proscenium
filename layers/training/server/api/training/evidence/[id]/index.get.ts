// One piece of evidence, for its subject or a verifier at its course (E4).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { evidenceFor } from '../../../../evidence'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'default',
}, async (event, { actor }) => evidenceFor(actor, getRouterParam(event, 'id')!))
