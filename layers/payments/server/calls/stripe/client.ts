// The one place Payments talks to Stripe's API. Every request is form-encoded, as Stripe's API takes
// it, sends the secret key, and pins the API version so the shapes read here do not move under us.
// A POST carries an idempotency key, so a retry with the same key gets Stripe's saved answer
// (https://docs.stripe.com/api/idempotent_requests). Tests replace `transport.fetch`.

const BASE = 'https://api.stripe.com/v1'
export const STRIPE_VERSION = '2024-06-20'

export const transport = { fetch: (input: string, init: RequestInit): Promise<Response> => fetch(input, init) }

/** An error Stripe answered with. A status of 400 to 499 means asking again will not help. */
export class StripeError extends Error {
  constructor(readonly status: number, readonly code: string | undefined, message: string) {
    super(message)
  }

  /**
   * Whether asking again cannot help: Stripe refused the request itself (400, 402 or 404). A key that
   * is wrong (401, 403), a conflict (409) or a rate limit (429) may pass on a later try.
   */
  get final(): boolean {
    return [400, 402, 404].includes(this.status) // not-policy: HTTP statuses, from Stripe's error docs
  }
}

interface Params { [key: string]: string | number | boolean | undefined | Params | string[] }

/** Stripe's form encoding: nested objects as a[b]=c and lists as a[]=x. */
export function encode(params: Params, prefix = ''): string[] {
  const out: string[] = []
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue
    const name = prefix ? `${prefix}[${key}]` : key
    if (Array.isArray(value)) for (const item of value) out.push(`${encodeURIComponent(`${name}[]`)}=${encodeURIComponent(item)}`)
    else if (typeof value === 'object') out.push(...encode(value, name))
    else out.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`)
  }
  return out
}

export async function stripe<T>(method: 'GET' | 'POST', path: string, options: { key: string, params?: Params, idempotencyKey?: string }): Promise<T> {
  const query = encode(options.params ?? {}).join('&')
  const headers: Record<string, string> = { 'Authorization': `Bearer ${options.key}`, 'Stripe-Version': STRIPE_VERSION }
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey
  let url = `${BASE}${path}`
  let body: string | undefined
  if (method === 'GET') url += query ? `?${query}` : ''
  else {
    body = query
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
  }
  const response = await transport.fetch(url, { method, headers, body })
  const json = await response.json().catch(() => ({})) as { error?: { code?: string, message?: string } }
  if (!response.ok) throw new StripeError(response.status, json.error?.code, json.error?.message ?? `Stripe answered ${response.status}`)
  return json as T
}
