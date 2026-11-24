// The scenarios a person may practise (Practice mode, part 4, PM-S1): every contributed scenario, with
// whether this person may start it now and, if not, why (rule S1).
import { can, isEnabled, usePoint, useSetting, type Actor } from '#kit'
import { useRegistry } from '#kit/registry'

export interface PracticeScenario {
  id: string
  version: number
  label: string
  summary: string
  minutes: number
  needs: string[]
  samples: string[]
  start: string
  routes: string[]
  abilities: string[]
  tasks?: { id: string, label: string }[]
  runnable?: string[]
  outcomes?: Record<string, ('approved' | 'declined' | 'removed' | 'no-answer')[]>
}

/** Why a scenario cannot start: practice is off here, the theatre switched it off, or a module it needs is off. */
export type Unavailable = { code: 'core.practice.switched-off' } | { code: 'core.practice.scenario-off' } | { code: 'core.module.off', module: string }

export async function scenarios(): Promise<PracticeScenario[]> {
  return (await usePoint<PracticeScenario>('core.practice-scenario')).map(c => c.value)
}

export async function scenario(id: string): Promise<PracticeScenario | undefined> {
  return (await scenarios()).find(s => s.id === id)
}

/** What stops a scenario starting in the real site, or null when nothing does. */
export async function unavailable(s: PracticeScenario): Promise<Unavailable | null> {
  if (!(await useSetting('core.practice.enabled'))) return { code: 'core.practice.switched-off' }
  if ((await useSetting('core.practice.scenarios-off') as string[]).includes(s.id)) return { code: 'core.practice.scenario-off' }
  for (const module of s.needs) if (!useRegistry().modules.has(module) || !(await isEnabled(module))) return { code: 'core.module.off', module }
  return null
}

/** Whether the person may practise it: through a Training course, or as an administrator checking it (M1). */
export async function mayPractise(actor: Actor, id: string): Promise<boolean> {
  return (await can(actor, 'core.practice.use', ['core.practice-scenario', id])).allowed
}

/** Whether the person opens it as an administrator checking it, rather than through a course. */
export async function checking(actor: Actor): Promise<boolean> {
  return (await can(actor, 'core.practice.manage')).allowed
}
