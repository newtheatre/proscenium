// The site-readiness screen's checklist (C-42): what the public site still lacks, and whether search
// engines are being turned away.
import { defineRoute } from '#kit'
import { siteReadiness } from '../../readiness'

export default defineRoute({ ability: 'public-site.readiness.view', rateLimit: 'default' }, async event => siteReadiness(event))
