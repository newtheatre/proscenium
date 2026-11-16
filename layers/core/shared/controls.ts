// How a setting's stored value becomes what a control shows and back (UI-14). Durations are stored
// in seconds and typed as 30m, 2h or 14d; money is stored in pence and typed in pounds.

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

export function toControl(setting: ControlSetting, value: unknown = setting.value): unknown {
  if (value === null || value === undefined) return setting.kind === 'boolean' ? false : setting.kind === 'list' ? [] : ''
  switch (setting.kind) {
    case 'duration': return durationText(value as number)
    case 'money': return (value as number) / 100 // not-policy: pence to pounds
    case 'custom': return JSON.stringify(value)
    default: return value
  }
}

export function fromControl(kind: string, control: unknown, unset = false): unknown {
  if ((control === '' || control === undefined) && unset) return null
  switch (kind) {
    case 'money': return typeof control === 'number' ? Math.round(control * 100) : control // not-policy: pounds to pence
    case 'custom':
      try { return JSON.parse(String(control)) }
      catch { return control }
    default: return control
  }
}

export const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
