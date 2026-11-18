// The site's health checks that are not ok, failing first, for the Admin overview (AC-12).
import { defineRoute } from '#kit'
import { healthProblems } from '../../../interface/health'

export default defineRoute({ ability: 'core.health.view', rateLimit: 'default' }, async () => ({ problems: await healthProblems() }))
