// Uploads a receipt photo or PDF for an item (BC-19). The body is the file's bytes; its name comes in
// the query. Core checks the file's kind from its bytes and strips an image's metadata.
import { getHeader, getRouterParam, readRawBody } from 'h3'
import { z } from 'zod'
import { defineRoute, refuse } from '#kit'
import { receiptLimit, requireClaim, requireItem, requireOwnEditable, uploadReceipt } from '../../../../../../../claims'

const input = z.object({ name: z.string().trim().min(1).max(255) }) // not-policy: core's column limit for a file's name

export default defineRoute({ ability: 'budgets.claim.make', rateLimit: 'write', body: 'binary', input }, async (event, { input, unit, actor }) => {
  const claim = await requireClaim(getRouterParam(event, 'id'))
  await requireOwnEditable(actor, claim)
  const item = await requireItem(claim, getRouterParam(event, 'itemId'))
  if (Number(getHeader(event, 'content-length') ?? 0) > await receiptLimit()) refuse('core.files.too-large', 'This file is larger than a receipt may be.', { status: 413, fields: { file: 'too-large' } })
  const body = await readRawBody(event, false)
  return uploadReceipt(unit, actor, claim, item, { name: input.name, bytes: body ? new Uint8Array(body) : new Uint8Array() })
})
