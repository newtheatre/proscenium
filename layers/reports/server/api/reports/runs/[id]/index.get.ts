// One copy: its question, its state and, once done, the table as it stood.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { openRun } from '../../../../runs'

export default defineRoute({ ability: 'reports.report.view', rateLimit: 'default' }, async (event, { actor }) => openRun(actor, getRouterParam(event, 'id')!))
