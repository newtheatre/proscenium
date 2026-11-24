// Reports (spec "Reports", stories REP-04 onwards): reads figures from every module through
// core.measure, and figures per person through core.person-measure, which only it may read. It keeps
// no figures of its own; a page reads each one live.
import { z } from 'zod'
import { ability, defineAbilities, defineModule, point } from '#kit'
import { AREAS, PERIOD_RULES, SCOPE_KINDS } from './shared/reports'

const KEY = /^[a-z][a-z0-9]*(-[a-z0-9]+)*\.[a-z][a-z0-9]*(-[a-z0-9]+)*$/

export default defineModule({
  id: 'reports',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',

  abilities: defineAbilities('reports', {
    // Each figure still needs its own module's ability, so Reports never shows more than the module would.
    'report.view': ability({ on: 'core.production' }),
    // Figures per named person (rules P1, P2): granted on purpose, and every read is audited.
    'people.view': ability({ risk: 'privileged', fresh: false, audit: 'read', implies: ['report.view'] }),
  }),

  points: {
    // A ready-made report (rules K1 to K3): figures, a scope and period rule and a breakdown.
    'reports.report': point({
      kind: 'data',
      schema: z.object({
        id: z.string().regex(KEY),
        label: z.string(),
        description: z.string(),
        area: z.enum(AREAS),
        scope: z.enum(SCOPE_KINDS),
        period: z.enum(PERIOD_RULES),
        breakdown: z.string().optional(),
        figures: z.array(z.string().regex(KEY)).min(1).max(12), // not-policy: a ready-made report's width
        chart: z.enum(['bar', 'line']).optional(),
        ability: z.string(),
        order: z.number().int().optional(),
      }).strict(),
    }),
  },

  contributes: {
    'core.navigation': [
      { id: 'reports.reports', menu: 'console', group: 'reports', section: 'everyday', to: '/console/reports', icon: 'i-lucide-chart-column', ability: 'reports.report.view', order: 10 },
    ],
  },
})
