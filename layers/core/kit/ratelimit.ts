// Rate limits, counted outside D1 (per Worker isolate for now). Each route declares its class; the
// limits per minute are core settings, so a theatre can loosen or tighten them.
import { useSetting } from './settings-store'
import { nowMs } from './clock'

export const RATE_CLASSES = ['default', 'write', 'sign-in', 'public-form', 'export'] as const
export type RateClass = typeof RATE_CLASSES[number]

const windows = new Map<string, { count: number, resets: number }>()
const WINDOW = 60_000 // not-policy: limits are per minute

/** True while the caller is within the class's limit; counts this request. */
export async function takeRate(rateClass: RateClass, who: string): Promise<boolean> {
  const limit = await useSetting(`core.rate-limits.${rateClass}` as any) as number
  const at = nowMs()
  const key = `${rateClass}:${who}`
  const current = windows.get(key)
  if (!current || current.resets <= at) {
    windows.set(key, { count: 1, resets: at + WINDOW })
    if (windows.size > 10_000) for (const [k, w] of windows) if (w.resets <= at) windows.delete(k) // not-policy: memory bound
    return true
  }
  current.count++
  return current.count <= limit
}

/** Tests only: forget every count. */
export function resetRateLimits(): void {
  windows.clear()
}
