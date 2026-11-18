// The core's settings: the platform's own operational numbers.
import { defineSettings, defineSettingRules, setting } from '#kit'
import { normaliseOrigin } from '#kit/origin'
import type { SettingGroupDecl, SettingPageDecl } from '#kit/manifest'

/**
 * Where every group of core's settings is shown (settings build brief, agreed by Matt on 16
 * November 2026). Core has no settings page of its own, so each group names a page, the Advanced
 * page or the bespoke screen that manages it. Identity's and the core domain's groups are here too,
 * so the whole placement reads as one table.
 */
export const settingPages: Record<string, SettingPageDecl> = {
  'theatre': { place: 'admin', group: 'theatre', order: 10, icon: 'i-lucide-theater' },
  'branding': { place: 'admin', group: 'theatre', order: 20, icon: 'i-lucide-palette' },
  'sign-in': { place: 'admin', group: 'access', order: 30, icon: 'i-lucide-log-in' },
  'privacy': { place: 'admin', group: 'access', order: 40, icon: 'i-lucide-shield' },
  // Tabs of Core's page in Admin's Modules; console staff open them from the cog on Programme's and People's pages.
  'programme': { place: 'admin', group: 'modules', order: 10, icon: 'i-lucide-calendar-days', to: '/admin/modules/core', settingsIn: ['programme'] },
  'people': { place: 'admin', group: 'modules', order: 20, icon: 'i-lucide-users', to: '/admin/modules/core/people', settingsIn: ['people'] },
}
const on = (page: string): SettingGroupDecl => ({ page })
const advanced: SettingGroupDecl = { advanced: true }
export const settingGroups: Record<string, SettingGroupDecl> = {
  'site': on('theatre'),
  'organisation': on('theatre'),
  'locale': on('theatre'),
  // Branding is to become a bespoke screen; until it is, its groups are drawn on a generated page there.
  'brand': on('branding'),
  'appearance': on('branding'),
  'sign-in': on('sign-in'),
  'sessions': on('sign-in'),
  'recovery': on('sign-in'),
  'access': on('sign-in'),
  'privacy': on('privacy'),
  // The Email sending screen draws these in its own settings section (C-59), saved as a generated
  // page saves them; the verified domain is its status line.
  'notifications': { screen: '/admin/email' },
  'units': advanced,
  'jobs': advanced,
  'external': advanced,
  'idempotency': advanced,
  'rate-limits': advanced,
  'retention': advanced,
  'files': advanced,
  'delivery': advanced,
  // The Webhooks screen draws these under its list (C-49).
  'webhooks': { screen: '/admin/webhooks' },
  'lists': advanced,
  'programme': on('programme'),
  'grants': on('people'),
  'members-area': on('people'),
  'access-scheme': on('people'),
  'emergency-contacts': on('people'),
  'merge': on('people'),
}

const change = 'core.settings.manage'

export const settings = defineSettings('core', {
  // Colour mode (UI-24, the interface): what a first-time visitor sees, and whether people may choose.
  'appearance.default': setting.choice({ default: 'system', options: ['system', 'light', 'dark'], change, audience: 'public' }),
  'appearance.let-people-choose': setting.boolean({ default: true, change, audience: 'public' }),
  'appearance.public-dark': setting.boolean({ default: true, change, audience: 'public' }),
  'appearance.live-dark': setting.boolean({ default: true, change, audience: 'public' }),

  'site.name': setting.text({ unset: true, minLength: 1, maxLength: 80, change, audience: 'public', quotable: true }),
  // The one public origin (https://host). Setup records it; other hosts redirect reads and refuse changes.
  'site.origin': setting.text({ unset: true, maxLength: 200, change, onChange: 'confirm' }),

  // Unset until setup: until then scheduled tasks run on UTC and no theatre date is computed.
  'locale.time-zone': setting.choice({ unset: true, catalogue: 'time-zone', change, audience: 'public', onChange: 'confirm' }),
  'locale.currency': setting.choice({ default: 'GBP', catalogue: 'currency', change, audience: 'public', quotable: true }),
  'locale.language': setting.choice({ default: 'en-GB', catalogue: 'language', change, audience: 'public' }),
  'locale.day-start': setting.time({ default: '04:00', min: '00:00', max: '08:00', change, onChange: 'confirm' }),

  'units.statement-limit': setting.integer({ default: 50, min: 10, max: 1000, unit: 'core.units.statements', change }),
  // At most 2,000 (U9): measured on D1 on 2026-11-16; the Worker's own cost is still to measure.
  'units.set-rows-limit': setting.integer({ default: 500, min: 10, max: 2000, unit: 'core.units.rows', change }),
  'jobs.attempts': setting.integer({ default: 5, min: 1, max: 20, unit: 'core.units.attempts', change }),
  'jobs.backoff': setting.duration({ default: '30s', min: '5s', max: '1h', change }),
  'jobs.timeout': setting.duration({ default: '15m', min: '1m', max: '12h', change }),
  'jobs.keep-for': setting.duration({ default: '14d', min: '1d', max: '365d', change }),

  'external.timeout': setting.duration({ default: '15s', min: '1s', max: '60s', change }),
  'external.reconcile-after': setting.duration({ default: '5m', min: '1m', max: '1d', change }),

  'access.fresh-within': setting.duration({ default: '10m', min: '1m', max: '1d', change }),
  'idempotency.keep-for': setting.duration({ default: '48h', min: '1h', max: '7d', change }),

  // Allowances for each rate-limit class (F-36). The figures are the specification's proposals.
  'rate-limits.default': setting.rate({ default: { count: 600, per: '1m' }, change, onChange: 'confirm' }),
  'rate-limits.write': setting.rate({ default: { count: 120, per: '1m' }, change, onChange: 'confirm' }),
  'rate-limits.sign-in': setting.rate({ default: { count: 10, per: '10m' }, change, onChange: 'confirm' }),
  'rate-limits.sign-in-network': setting.rate({ default: { count: 200, per: '10m' }, change, onChange: 'confirm' }),
  'rate-limits.public-form': setting.rate({ default: { count: 20, per: '10m' }, change, onChange: 'confirm' }),
  'rate-limits.export': setting.rate({ default: { count: 10, per: '1h' }, change, onChange: 'confirm' }),
  'rate-limits.presented-value': setting.rate({ default: { count: 10, per: '10m' }, change, onChange: 'confirm' }),

  'retention.audit': setting.duration({ default: '2555d', min: '365d', max: '3650d', change }),
  // How many rows a list shows when its address names no size (Foundations, 16 November).
  // Public so a list page knows the size an address without one means, as the server does.
  'lists.page-size': setting.choice({ default: '25', options: ['25', '50', '100'], change, audience: 'public' }),

  'retention.setting-changes': setting.duration({ default: '2555d', min: '365d', max: '3650d', change }),
})

export const settingRules = defineSettingRules('core', [
  { id: 'site-origin-shape', check: s => s['site.origin'] === null || normaliseOrigin(s['site.origin']) === s['site.origin'] },
])
