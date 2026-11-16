// The settings a browser may know: those whose audience is public, with the text a content token
// shows for each quotable one.
import { defineRoute, formatSetting, useSetting } from '#kit'
import { useRegistry } from '#kit/registry'

export default defineRoute({ public: true, rateLimit: 'default' }, async () => {
  const out: Record<string, { value: unknown, text?: string }> = {}
  const currency = await useSetting('core.locale.currency') as string
  for (const [key, { entry }] of useRegistry().settings) {
    if ((entry.audience ?? 'staff') !== 'public') continue
    const value = await useSetting(key as any)
    out[key] = entry.quotable ? { value, text: formatSetting(entry, value, { currency }) } : { value }
  }
  return out
})
