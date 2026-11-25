// Saved copies: every copy this person may open today, newest first.
import { defineRoute } from '#kit'
import { listRuns } from '../../../runs'

export default defineRoute({ ability: 'reports.report.view', rateLimit: 'default' }, async (_event, { actor }) => ({ runs: await listRuns(actor) }))
