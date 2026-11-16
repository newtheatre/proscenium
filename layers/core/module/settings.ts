// The core's settings: the platform's own operational numbers.
import { defineSettings, defineSettingRules, setting } from '#kit'
import { normaliseOrigin } from '#kit/origin'

const change = 'core.settings.manage'
// Every one of foundations' settings is the site's, shown under /admin/settings (R-33).
const scope = 'site'

export const settings = defineSettings('core', {
  // Colour mode (UI-24, the interface): what a first-time visitor sees, and whether people may choose.
  'appearance.default': setting.choice({ default: 'system', options: ['system', 'light', 'dark'], change, scope, audience: 'public' }),
  'appearance.let-people-choose': setting.boolean({ default: true, change, scope, audience: 'public' }),
  'appearance.public-dark': setting.boolean({ default: true, change, scope, audience: 'public' }),
  'appearance.live-dark': setting.boolean({ default: true, change, scope, audience: 'public' }),

  'site.name': setting.text({ unset: true, minLength: 1, maxLength: 80, change, scope, audience: 'public', quotable: true }),
  // The one public origin (https://host). Setup records it; other hosts redirect reads and refuse changes.
  'site.origin': setting.text({ unset: true, maxLength: 200, change, scope, onChange: 'confirm' }),

  // Unset until setup: until then scheduled tasks run on UTC and no theatre date is computed.
  'locale.time-zone': setting.text({ unset: true, maxLength: 64, change, scope, audience: 'public', onChange: 'confirm' }),
  'locale.currency': setting.text({ default: 'GBP', maxLength: 3, change, scope, audience: 'public', quotable: true }),
  'locale.language': setting.text({ default: 'en-GB', maxLength: 35, change, scope, audience: 'public' }),
  'locale.day-start': setting.time({ default: '04:00', min: '00:00', max: '08:00', change, scope, onChange: 'confirm' }),

  'units.statement-limit': setting.integer({ default: 50, min: 10, max: 1000, unit: 'core.units.statements', change, scope }),
  // At most 2,000 (U9): measured on D1 on 2026-11-16; the Worker's own cost is still to measure.
  'units.set-rows-limit': setting.integer({ default: 500, min: 10, max: 2000, unit: 'core.units.rows', change, scope }),
  'jobs.attempts': setting.integer({ default: 5, min: 1, max: 20, unit: 'core.units.attempts', change, scope }),
  'jobs.backoff': setting.duration({ default: '30s', min: '5s', max: '1h', change, scope }),
  'jobs.timeout': setting.duration({ default: '15m', min: '1m', max: '12h', change, scope }),
  'jobs.keep-for': setting.duration({ default: '14d', min: '1d', max: '365d', change, scope }),

  'external.timeout': setting.duration({ default: '15s', min: '1s', max: '60s', change, scope }),
  'external.reconcile-after': setting.duration({ default: '5m', min: '1m', max: '1d', change, scope }),

  'access.fresh-within': setting.duration({ default: '10m', min: '1m', max: '1d', change, scope }),
  'idempotency.keep-for': setting.duration({ default: '48h', min: '1h', max: '7d', change, scope }),

  // Allowances for each rate-limit class (F-36). The figures are the specification's proposals.
  'rate-limits.default': setting.rate({ default: { count: 600, per: '1m' }, change, scope, onChange: 'confirm' }),
  'rate-limits.write': setting.rate({ default: { count: 120, per: '1m' }, change, scope, onChange: 'confirm' }),
  'rate-limits.sign-in': setting.rate({ default: { count: 10, per: '10m' }, change, scope, onChange: 'confirm' }),
  'rate-limits.public-form': setting.rate({ default: { count: 20, per: '10m' }, change, scope, onChange: 'confirm' }),
  'rate-limits.export': setting.rate({ default: { count: 10, per: '1h' }, change, scope, onChange: 'confirm' }),
  'rate-limits.presented-value': setting.rate({ default: { count: 10, per: '10m' }, change, scope, onChange: 'confirm' }),

  'retention.audit': setting.duration({ default: '2555d', min: '365d', max: '3650d', change, scope }),
  'retention.setting-changes': setting.duration({ default: '2555d', min: '365d', max: '3650d', change, scope }),
})

export const settingRules = defineSettingRules('core', [
  {
    id: 'time-zone-known',
    check: (s) => {
      if (s['locale.time-zone'] === null) return true
      try {
        new Intl.DateTimeFormat('en-GB', { timeZone: s['locale.time-zone'] })
        return true
      }
      catch {
        return false
      }
    },
  },
  { id: 'currency-code', check: s => /^[A-Z]{3}$/.test(s['locale.currency']) },
  { id: 'site-origin-shape', check: s => s['site.origin'] === null || normaliseOrigin(s['site.origin']) === s['site.origin'] },
  {
    id: 'language-known',
    check: (s) => {
      try {
        return Intl.getCanonicalLocales(s['locale.language'])[0] === s['locale.language']
      }
      catch {
        return false
      }
    },
  },
])
