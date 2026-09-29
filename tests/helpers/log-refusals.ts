// Measuring only: prints the body of every refused request, so a failing status has its reason.
const original = globalThis.fetch
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const response = await original(input, init)
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (response.status >= 400 && url.includes('localhost')) {
    const text = await response.clone().text().catch(() => '')
    const reason = text.match(/"statusMessage":\s*"([^"]*)"/)?.[1] ?? text.slice(0, 160)
    console.error(`[refused] ${init?.method ?? 'GET'} ${new URL(url).pathname} ${response.status} ${reason}`)
  }
  return response
}) as typeof fetch
