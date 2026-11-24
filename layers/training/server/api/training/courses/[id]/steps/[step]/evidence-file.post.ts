// Uploads the file for a certificate or declaration (E2, E4): checked by core before it can be sent
// with the evidence, under the evidence id this answers. The body is the file's bytes.
import { getRouterParam, readRawBody } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { uploadEvidenceFile } from '../../../../../../evidence'

export default defineRoute({
  ability: 'training.course.view',
  record: event => ['training.course', getRouterParam(event, 'id')],
  rateLimit: 'write',
  body: 'binary',
  input: z.object({
    accountId: z.string().min(1).optional(),
    name: z.string().max(255).optional(), // not-policy: core's column limit
  }),
}, async (event, { input, record, actor, unit }) => {
  const body = await readRawBody(event, false)
  return uploadEvidenceFile(unit.view(), actor, { courseId: record!.id, stepId: getRouterParam(event, 'step')! }, { ...input, bytes: body ? new Uint8Array(body) : new Uint8Array() })
})
