// Saves the brand in one unit (C-35, C-36). The ability is privileged, so saving asks for a fresh,
// strong sign-in. A logo must be an uploaded, checked file with alt text. The revision rises once per
// save, so every cached stylesheet and logo is replaced within a minute.
import { changeSetting, defineRoute, useSetting } from '#kit'
import { attachFile, detachFile } from '../../../files/service'
import { brandInput } from '../../../brand/input'

const SETTINGS = {
  accent: 'core.brand.accent',
  neutral: 'core.brand.neutral',
  displayFont: 'core.brand.display-font',
  bodyFont: 'core.brand.body-font',
  radius: 'core.brand.radius',
  creditLine: 'core.brand.credit-line',
} as const
const LOGOS = { logo: ['core.brand.logo', 'core.brand-logo'], logoDark: ['core.brand.logo-dark', 'core.brand-logo-dark'] } as const

export default defineRoute({
  ability: 'core.branding.edit',
  rateLimit: 'write',
  idempotent: true,
  input: brandInput,
}, async (_event, { input, unit }) => {
  let changed = false
  for (const [field, key] of Object.entries(SETTINGS) as [keyof typeof SETTINGS, string][]) {
    const value = input[field]
    if (value === undefined || value === await useSetting(key as any)) continue
    await changeSetting(unit, key, value)
    changed = true
  }
  for (const [field, [key, slot]] of Object.entries(LOGOS) as [keyof typeof LOGOS, readonly [string, string]][]) {
    const value = input[field]
    const current = await useSetting(key as any) as string | null
    if (value === undefined || value === current) continue
    if (value === null) {
      if (current) await detachFile(unit, current)
      await changeSetting(unit, key, null, { reset: true })
    }
    else {
      await attachFile(unit, value, { slot, ownerType: 'site', ownerId: 'site' })
      await changeSetting(unit, key, value)
    }
    changed = true
  }
  const revision = await useSetting('core.brand.revision') as number
  if (!changed) return { revision, changed: false }
  await changeSetting(unit, 'core.brand.revision', revision + 1)
  unit.announce('core.branding.changed', { revision: revision + 1 })
  return { revision: revision + 1, changed: true }
})
