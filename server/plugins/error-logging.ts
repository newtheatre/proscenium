import type { H3Error, H3Event } from 'h3'

// A same-origin referer carries the guest booking token in `?t=`, so only the
// path of one is ever logged (ADR-0009).
function internalReferrerPath(event: H3Event): string | undefined {
  const referer = getRequestHeader(event, 'referer')
  if (!referer) return undefined
  try {
    const url = new URL(referer)
    return url.host === getRequestURL(event).host ? url.pathname : undefined
  }
  catch {
    return undefined
  }
}

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (error, { event }) => {
    const clientError = error as H3Error
    const status = clientError.statusCode ?? 500
    // 5xx and anything unhandled keep Nitro's fatal log and its stack (ADR-0047).
    if (!event || clientError.unhandled || status < 400 || status > 499) return

    // Clearing `fatal` is what stops Nitro logging an expected 404 as an exception.
    clientError.fatal = false

    const line = `[${status}] ${event.method} ${getRequestURL(event).pathname}`
    const from = internalReferrerPath(event)
    if (from) console.warn(`${line} linked from ${from}`)
    else console.log(line)
  })
})
