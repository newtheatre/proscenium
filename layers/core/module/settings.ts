// The core's settings: the platform's own operational numbers.
import { defineSettings, defineSettingRules, setting } from '#kit'

const change = 'core.settings.manage'

export const settings = defineSettings('core', {
  'site.name': setting.text({ unset: true, minLength: 1, maxLength: 80, change, audience: 'public', quotable: true }),

  // Unset until setup: until then scheduled tasks run on UTC and no theatre date is computed.
  'locale.time-zone': setting.text({ unset: true, maxLength: 64, change, audience: 'public', onChange: 'confirm' }),
  'locale.currency': setting.text({ default: 'GBP', maxLength: 3, change, audience: 'public', quotable: true }),
  'locale.language': setting.text({ default: 'en-GB', maxLength: 35, change, audience: 'public' }),
  'locale.day-start': setting.time({ default: '04:00', min: '00:00', max: '08:00', change, onChange: 'confirm' }),

  'units.statement-limit': setting.integer({ default: 50, min: 10, max: 1000, unit: 'core.units.statements', change }),
  // Provisional until measured on a real D1 database (U9).
  'units.set-rows-limit': setting.integer({ default: 500, min: 10, max: 5000, unit: 'core.units.rows', change }),
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
  'rate-limits.public-form': setting.rate({ default: { count: 20, per: '10m' }, change, onChange: 'confirm' }),
  'rate-limits.export': setting.rate({ default: { count: 10, per: '1h' }, change, onChange: 'confirm' }),

  'retention.audit': setting.duration({ default: '2555d', min: '365d', max: '3650d', change }),
  'retention.setting-changes': setting.duration({ default: '2555d', min: '365d', max: '3650d', change }),
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
