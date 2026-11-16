// The core's settings: the platform's own operational numbers.
import { defineSettings, defineSettingRules, setting } from '#kit'

const change = 'core.settings.manage'

export const settings = defineSettings('core', {
  'locale.time-zone': setting.text({ default: 'Europe/London', maxLength: 64, change, audience: 'public' }),
  'locale.currency': setting.text({ default: 'GBP', maxLength: 3, change, audience: 'public', quotable: true }),

  'units.statement-limit': setting.integer({ default: 50, min: 10, max: 1000, unit: 'core.units.statements', change }),
  'jobs.attempts': setting.integer({ default: 5, min: 1, max: 20, unit: 'core.units.attempts', change }),
  'jobs.backoff': setting.duration({ default: '30s', min: '5s', max: '1h', change }),
  'jobs.timeout': setting.duration({ default: '15m', min: '1m', max: '12h', change }),
  'jobs.keep-for': setting.duration({ default: '14d', min: '1d', max: '365d', change }),

  'external.timeout': setting.duration({ default: '15s', min: '1s', max: '60s', change }),
  'external.reconcile-after': setting.duration({ default: '5m', min: '1m', max: '1d', change }),

  'access.fresh-within': setting.duration({ default: '10m', min: '1m', max: '1d', change }),
  'idempotency.keep-for': setting.duration({ default: '48h', min: '1h', max: '7d', change }),

  'rate-limits.default': setting.integer({ default: 120, min: 1, max: 10000, unit: 'core.units.per-minute', change }),
  'rate-limits.write': setting.integer({ default: 30, min: 1, max: 10000, unit: 'core.units.per-minute', change }),
  'rate-limits.sign-in': setting.integer({ default: 10, min: 1, max: 1000, unit: 'core.units.per-minute', change }),
  'rate-limits.public-form': setting.integer({ default: 10, min: 1, max: 1000, unit: 'core.units.per-minute', change }),
  'rate-limits.export': setting.integer({ default: 5, min: 1, max: 1000, unit: 'core.units.per-minute', change }),

  'retention.audit': setting.duration({ default: '2555d', min: '365d', max: '3650d', change }),
  'retention.setting-changes': setting.duration({ default: '2555d', min: '365d', max: '3650d', change }),
})

export const settingRules = defineSettingRules('core', [
  {
    id: 'time-zone-known',
    check: (s) => {
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
])
