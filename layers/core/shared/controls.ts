// How a setting's stored value becomes what a control shows and back (UI-14). Durations are stored
// in seconds and sent as 30m, 2h or 14d (FieldDuration shows a number and a unit); money stays in
// pence, which FieldMoney shows in pounds.

const UNITS: [number, string][] = [[604800, 'w'], [86400, 'd'], [3600, 'h'], [60, 'm'], [1, 's']] // not-policy: units of time

export function durationText(seconds: number): string {
  for (const [size, unit] of UNITS) if (seconds >= size && seconds % size === 0) return `${seconds / size}${unit}`
  return '0m'
}

export interface ControlSetting {
  kind: string
  value: unknown
  unset?: boolean
}

/** A rate as its two controls hold it: a count, and a period typed as 10m or 1h. */
export interface RateControl { count: number | undefined, per: string }

export function toControl(setting: ControlSetting, value: unknown = setting.value): unknown {
  if (value === null || value === undefined) return setting.kind === 'boolean' ? false : setting.kind === 'list' ? [] : setting.kind === 'rate' ? { count: undefined, per: '' } : ''
  switch (setting.kind) {
    case 'duration': return durationText(value as number)
    // Stored with the period in seconds; shown as two controls.
    case 'rate': {
      const { count, per } = value as { count: number, per: number }
      return { count, per: durationText(per) } satisfies RateControl
    }
    // A custom value that is text is typed as text; anything else as JSON.
    case 'custom': return typeof value === 'string' ? value : JSON.stringify(value)
    default: return value
  }
}

/** The value to send for what a control holds. `like` is a value of the setting, to tell text from JSON. */
export function fromControl(kind: string, control: unknown, unset = false, like?: unknown): unknown {
  if ((control === '' || control === undefined) && unset) return null
  switch (kind) {
    case 'rate': {
      const { count, per } = (control ?? {}) as Partial<RateControl>
      return { count: count ?? null, per: (per ?? '').trim() }
    }
    case 'custom':
      if (typeof like === 'string') return control
      try { return JSON.parse(String(control)) }
      catch { return control }
    default: return control
  }
}

/** How a value reads in a sentence, such as the default beside a changed setting. */
export function controlText(kind: string, control: unknown, words: { on: string, off: string, rate: (count: number, per: string) => string, duration?: (text: string) => string, money?: (minor: number) => string }): string {
  if (kind === 'boolean') return control ? words.on : words.off
  if (kind === 'rate') {
    const { count, per } = control as RateControl
    return count === undefined ? '' : words.rate(count, words.duration?.(per) ?? per)
  }
  if (kind === 'duration' && words.duration) return words.duration(String(control))
  if (kind === 'money' && words.money && typeof control === 'number') return words.money(control)
  return String(Array.isArray(control) ? control.join(', ') : control)
}

export const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
