// Reports (spec "Reports", stories REP-04 onwards): reads figures from every module through
// core.measure, and figures per person through core.person-measure, which only it may read. It keeps
// no figures of its own; a page reads each one live, and a copy keeps its answer as files.
import { z } from 'zod'
import { ability, defineAbilities, defineModule, defineRecords, defineSettings, job, point, setting, task } from '#kit'
import { tables } from './server/db/schema'
import { AREAS, PERIOD_RULES, SCOPE_KINDS } from './shared/reports'

const change = 'reports.settings.manage'
const DAYS = ['year', 'month', 'week', 'day'] as const

const KEY = /^[a-z][a-z0-9]*(-[a-z0-9]+)*\.[a-z][a-z0-9]*(-[a-z0-9]+)*$/

export default defineModule({
  id: 'reports',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',

  settings: defineSettings('reports', {
    'runs.keep-for': setting.duration({ default: '730d', min: '30d', max: '2555d', units: DAYS, change, audience: 'staff', onChange: 'confirm' }),
    'runs.row-limit': setting.integer({ default: 20_000, min: 1000, max: 100_000, unit: 'reports.units.rows', change, audience: 'staff' }),
    'builder.max-columns': setting.integer({ default: 60, min: 1, max: 200, unit: 'reports.units.columns', change, audience: 'staff' }),
  }),

  records: defineRecords('reports', {
    run: { table: 'reports_runs', owner: 'requested_by' },
    definition: { table: 'reports_definitions', owner: 'made_by' },
  }),

  abilities: defineAbilities('reports', {
    // Each figure still needs its own module's ability, so Reports never shows more than the module would.
    'report.view': ability({ on: 'core.production' }),
    'report.create': ability({ implies: ['report.view'] }),
    'report.manage': ability({ on: 'reports.definition', implies: ['report.create', 'run.view'] }),
    // A copy; the person who asked for it holds this as its owner, if they still hold its figures' abilities.
    'run.view': ability({ on: 'reports.run', owner: 'grants' }),
    'run.export': ability({ implies: ['run.view'] }),
    // Figures per named person (rules P1, P2): granted on purpose, and every read is audited.
    'people.view': ability({ risk: 'privileged', fresh: false, audit: 'read', implies: ['report.view'] }),
    'settings.manage': ability({ risk: 'privileged' }),
  }),

  tables,

  jobs: {
    // A copy is worked out on the bulk lane, so a large report never delays a ticket email (R2).
    'reports.run-report': job({ payload: z.object({ runId: z.string() }), lane: 'bulk' }),
  },

  tasks: {
    'reports.expire-runs': task({ dailyAt: '03:40' }),
  },

  points: {
    // A module's own breakdown key (B6): its name and its values, so a page can label rows and offer a filter.
    'reports.key': point({ kind: 'code', contract: 'report-key' }),
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
      { id: 'reports.runs', menu: 'console', group: 'reports', section: 'everyday', to: '/console/reports/runs', match: '/console/reports/runs', icon: 'i-lucide-files', ability: 'reports.report.view', order: 20 },
    ],
    'core.file-slot': [
      { id: 'reports.run-csv', owner: 'reports.run', ability: 'reports.run.view', accepts: ['csv' as const], limit: 'core.files.document-limit', access: 'record' as const, textClass: 'internal' as const, clean: false, source: 'server' as const },
      { id: 'reports.run-data', owner: 'reports.run', ability: 'reports.run.view', accepts: ['json' as const], limit: 'core.files.document-limit', access: 'record' as const, textClass: 'internal' as const, clean: false, source: 'server' as const },
    ],
    'core.file-access': [{ id: 'reports.run', file: 'run' }],
  },
})
