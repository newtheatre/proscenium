// The one place Payments talks to SumUp's API (https://developer.sumup.com/api). Requests and answers
// are JSON, authorised with the merchant's API key. SumUp takes no idempotency key on a reader
// checkout or a refund, so the provider looks before it acts (contributions/payments.provider/sumup.ts).
// Tests replace `transport.fetch`.

const BASE = 'https://api.sumup.com'

export const transport = { fetch: (input: string, init: RequestInit): Promise<Response> => fetch(input, init) }

/** An error SumUp answered with: its status and whatever code its body gave. */
export class SumUpError extends Error {
  constructor(readonly status: number, readonly code: string | undefined, message: string) {
    super(message)
  }
}

export async function sumup<T>(method: 'GET' | 'POST', path: string, options: { key: string, query?: Record<string, string>, body?: unknown }): Promise<T | null> {
  const query = options.query ? `?${new URLSearchParams(options.query)}` : ''
  const headers: Record<string, string> = { Authorization: `Bearer ${options.key}`, Accept: 'application/json' }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  const response = await transport.fetch(`${BASE}${path}${query}`, { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) })
  const text = await response.text()
  let json: any
  try {
    json = text ? JSON.parse(text) : null
  }
  catch {
    json = null
  }
  if (!response.ok) {
    const code = json?.errors?.type ?? json?.errors?.[0]?.code ?? json?.error_code ?? json?.type ?? json?.title
    throw new SumUpError(response.status, typeof code === 'string' ? code : undefined, json?.detail ?? json?.message ?? `SumUp answered ${response.status}`)
  }
  return json as T | null
}
