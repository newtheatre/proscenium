// The Cloudflare API, for setting up the sending domain by itself (C-52). Only core calls it, with
// the optional credential CORE_CLOUDFLARE_TOKEN (Email Sending edit and Zone read), saved on Admin >
// Email sending or set as a Worker secret of the same name. The token is never
// shown, logged or returned: errors carry Cloudflare's numeric codes only. Tests swap the transport
// with setCloudflareFetch(), as they swap the mail binding with setMailer().
//
// Endpoints, checked against Cloudflare's API reference (its OpenAPI schema, "Create a sending
// subdomain" and "List sending subdomains" under Email Sending) on 2026-11-16:
//   GET  /zones?name=<zone>                              find the zone that holds the site's host
//   GET  /zones/{zone_id}/email/sending/subdomains       list sending subdomains
//   POST /zones/{zone_id}/email/sending/subdomains       create one, or re-enable an existing one
import { credential } from '#kit/secrets'

const API = 'https://api.cloudflare.com/client/v4'

type Fetch = (input: string, init?: RequestInit) => Promise<Response>
let transport: Fetch = (input, init) => fetch(input, init)

/** Replaces the transport, for tests. Passing nothing restores fetch. */
export function setCloudflareFetch(next?: Fetch): void {
  transport = next ?? ((input, init) => fetch(input, init))
}

/** A refused or failed call, carrying Cloudflare's error codes and the HTTP status only. */
export class CloudflareError extends Error {
  constructor(readonly status: number, readonly codes: number[]) {
    super(`core.cloudflare.failed: ${status} ${codes.join(',')}`)
    this.name = 'CloudflareError'
  }
}

export async function cloudflareToken(): Promise<string | null> {
  return await credential('CORE_CLOUDFLARE_TOKEN')
}

async function api<T>(path: string, init: { method?: string, body?: unknown } = {}): Promise<T> {
  const token = await cloudflareToken()
  if (!token) throw new CloudflareError(0, [])
  const response = await transport(`${API}${path}`, {
    method: init.method ?? 'GET',
    headers: { 'authorization': `Bearer ${token}`, 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const json = await response.json().catch(() => null) as { success?: boolean, errors?: { code: number }[], result?: T } | null
  if (!response.ok || !json?.success) throw new CloudflareError(response.status, (json?.errors ?? []).map(e => e.code))
  return json.result as T
}

export interface SendingSubdomain { tag: string, name: string, enabled: boolean }

/** The candidate zone names for a host, longest first: a.b.example.org, b.example.org, example.org. */
export function zoneCandidates(host: string): string[] {
  const labels = host.split('.')
  return labels.slice(0, -1).map((_, i) => labels.slice(i).join('.')).filter(name => name.includes('.'))
}

/** The active zone this token can see that holds `host`, by the longest matching suffix. */
export async function findZone(host: string): Promise<{ id: string, name: string } | null> {
  for (const name of zoneCandidates(host)) {
    const zones = await api<{ id: string, name: string, status: string }[]>(`/zones?name=${encodeURIComponent(name)}`)
    const zone = zones.find(z => z.name === name && z.status === 'active')
    if (zone) return { id: zone.id, name: zone.name }
  }
  return null
}

export async function listSendingSubdomains(zoneId: string): Promise<SendingSubdomain[]> {
  return api<SendingSubdomain[]>(`/zones/${encodeURIComponent(zoneId)}/email/sending/subdomains`)
}

/** Creates the sending subdomain, or re-enables it if it exists; Cloudflare writes its DNS records. */
export async function createSendingSubdomain(zoneId: string, name: string): Promise<SendingSubdomain> {
  return api<SendingSubdomain>(`/zones/${encodeURIComponent(zoneId)}/email/sending/subdomains`, { method: 'POST', body: { name } })
}

/** Whether the token is present and Cloudflare answers it: the health check's question, nothing more. */
export async function tokenReaches(): Promise<boolean> {
  try {
    await api<unknown[]>('/zones?per_page=1')
    return true
  }
  catch {
    return false
  }
}
