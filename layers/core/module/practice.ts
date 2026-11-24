// Practice mode (docs/specs/practice-mode): its settings, abilities, record type and points. It is
// a capability of the kit and core, not a module, so it is declared here and cannot be switched off
// except by its own setting.
import { z } from 'zod'
import { ability, defineAbilities, defineRecords, defineSettings, point, record, setting } from '#kit'

const change = 'core.practice.manage'

export const practiceSettings = defineSettings('core', {
  'practice.enabled': setting.boolean({ default: true, change, audience: 'signed-in' }),
  'practice.idle-end': setting.duration({ default: '2h', min: '15m', max: '12h', change, audience: 'signed-in' }),
  'practice.scenarios-off': setting.list({ default: [], of: 'text', maxLength: 80, choices: '/api/core/practice/choices', change, audience: 'signed-in' }),
  'practice.copy-configuration': setting.boolean({ default: true, change }),
})

export const practiceRecords = defineRecords('core', {
  // Its ids are the contributed scenario ids; there is no table.
  'practice-scenario': record({ point: 'core.practice-scenario' }),
})

export const practiceAbilities = defineAbilities('core', {
  // Held only through Training's fact training.practice-open, or by an administrator (Matt, 24 November 2026).
  'practice.use': ability({ on: 'core.practice-scenario', audit: false }),
  'practice.manage': ability({ grantAt: ['site'], implies: ['practice.use'] }),
})

const id = z.string().regex(/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/)

export const practicePoints = {
  /** One thing a person can practise, owned by the module whose live screen it opens (part 4). */
  'core.practice-scenario': point({
    kind: 'data',
    schema: z.object({
      id,
      version: z.number().int().min(1),
      label: z.string(),
      summary: z.string(),
      minutes: z.number().int().min(1),
      needs: z.array(z.string()),
      samples: z.array(id),
      start: z.string().startsWith('/live'),
      routes: z.array(z.string().startsWith('/live')).min(1),
      abilities: z.array(z.string()).min(1),
      tasks: z.array(z.object({ id: z.string(), label: z.string(), when: z.string().optional() }).strict()).optional(),
      runnable: z.array(z.string()).optional(),
      outcomes: z.record(z.string(), z.array(z.enum(['approved', 'declined', 'removed', 'no-answer']))).optional(),
    }).strict(),
  }),
  /** A named group of fictional records a module writes into a store: `definePracticeSample({ after, seed })`. */
  'core.practice-sample': point({ kind: 'code', contract: 'practice-sample' }),
  /** The task checks of one scenario, keyed by task id: read-only questions the module asks its own tables in the store (T1). */
  'core.practice-check': point({ kind: 'code', contract: 'practice-check' }),
}
