// Type tests (F-09): run by `bun run typecheck`. Each @ts-expect-error must be an error, or the
// type check fails.
import { useSetting, enqueue, defineRoute } from '#kit'
import type { SettingValue } from '#kit/registry-types'

export async function settingsAreTyped() {
  const zone: string = await useSetting('core.locale.time-zone')
  const attempts: number = await useSetting('core.jobs.attempts')
  // @ts-expect-error an undeclared setting is a type error
  await useSetting('core.no-such.setting')
  // @ts-expect-error a number setting is not a string
  const wrong: string = await useSetting('core.jobs.attempts')
  return { zone, attempts, wrong }
}

export const durationIsSeconds: SettingValue<'core.jobs.backoff'> = 30

export async function jobsAreTyped() {
  // @ts-expect-error an undeclared job is a type error
  await enqueue('core.no-such-job', {})
}

export const routesNameDeclaredAbilities = [
  // @ts-expect-error an undeclared ability is a type error
  defineRoute({ ability: 'core.nothing.do', rateLimit: 'default' }, () => null),
  defineRoute({ ability: 'core.settings.manage', rateLimit: 'default' }, () => null),
]
