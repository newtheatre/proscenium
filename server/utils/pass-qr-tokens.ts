import { PASS_DEVICE_COOKIE_NAME, passDeviceCookieValue, rememberPassToken, rememberedPassTokens, rememberedUntil } from '#shared/utils/pass-device'
import { passCurrentState } from './passes'
import type { H3Event } from 'h3'

// A pass's own QR (D-124 criterion 5), reusing D-108's signing scheme: `pass:` domain-separates
// a pass id from a reservation id, so neither token resolves against the other's route.
const DOMAIN = 'pass:'

// The single 60-minute cookie 0260 replaced; cleared wherever the device list is, so none lingers.
const RETIRED_COOKIE_NAME = 'nnt-pass-token'

export interface RememberedPass {
  passId: string
  token: string
}

// Verified, newest first: a forged or foreign token in the cookie is simply not remembered.
export async function rememberedPasses(event: H3Event): Promise<RememberedPass[]> {
  const remembered: RememberedPass[] = []
  for (const token of rememberedPassTokens(getCookie(event, PASS_DEVICE_COOKIE_NAME))) {
    const passId = await verifyPassQrToken(token)
    if (passId) remembered.push({ passId, token })
  }
  return remembered
}

// D-138 criterion 2 (0260): the browser keeps the token, never the address bar, until the latest
// remembered pass's validity ends.
export async function rememberPassQrToken(event: H3Event, token: string): Promise<void> {
  const tokens = rememberPassToken((await rememberedPasses(event)).map(one => one.token), token)
  const validUntil: number[] = []
  for (const one of tokens) {
    const passId = await verifyPassQrToken(one)
    const pass = passId ? await passCurrentState(passId) : undefined
    if (pass) validUntil.push(pass.validUntil)
  }
  setCookie(event, PASS_DEVICE_COOKIE_NAME, passDeviceCookieValue(tokens), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: rememberedUntil(validUntil, Math.floor(Date.now() / 1000)),
  })
}

// The path has to match rememberPassQrToken's, or the browser keeps the cookie.
export function forgetPassQrToken(event: H3Event): void {
  deleteCookie(event, PASS_DEVICE_COOKIE_NAME, { path: '/' })
  deleteCookie(event, RETIRED_COOKIE_NAME, { path: '/' })
}

export async function passQrTokenFor(passId: string): Promise<string> {
  return qrTokenFor(DOMAIN + passId)
}

// The pass id a presented token names, or null for a forged token, a malformed one, or a
// reservation's own token presented here by mistake.
export async function verifyPassQrToken(token: string): Promise<string | null> {
  const decoded = await verifyQrToken(token)
  return decoded?.startsWith(DOMAIN) ? decoded.slice(DOMAIN.length) : null
}
