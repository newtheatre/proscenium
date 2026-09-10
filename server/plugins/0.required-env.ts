// Names a missing worker secret before whichever route needs it first does: a blank one has
// no dev fallback and reads exactly like an unrelated regression (docs/known-issues.md).

let checked = false

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    if (checked) return
    checked = true

    // Every top-level string in runtimeConfig is a worker secret with no fallback; session
    // and public nest their own, and are covered elsewhere (0.secrets-store.ts).
    const config = useRuntimeConfig(event) as unknown as Record<string, unknown>
    const missing = Object.entries(config)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length === 0)
      .map(([key]) => key)

    if (missing.length === 0) return

    // Names only, never a value: copy the matching keys from .env.example into .env.
    console.error(`[required-env] missing, no dev fallback: ${missing.join(', ')}`)
  })
})
