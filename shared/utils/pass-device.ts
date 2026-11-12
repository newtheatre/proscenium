// D-138 criterion 2: the pass tokens a browser keeps in its own cookie, newest first (0260).

export const PASS_DEVICE_COOKIE_NAME = 'nnt-passes'
export const PASS_DEVICE_LIMIT = 4

// `~` is outside both halves of a token (hex id, `.`, base64url signature), so splitting is unambiguous.
const SEPARATOR = '~'
const HOUR_SECONDS = 3600
const BROWSER_MAX_SECONDS = 400 * 86_400

export function rememberedPassTokens(value: string | undefined): string[] {
  return (value ?? '').split(SEPARATOR).filter(token => token.length > 0).slice(0, PASS_DEVICE_LIMIT)
}

export function rememberPassToken(tokens: string[], token: string): string[] {
  return [token, ...tokens.filter(one => one !== token)].slice(0, PASS_DEVICE_LIMIT)
}

export function passDeviceCookieValue(tokens: string[]): string {
  return tokens.join(SEPARATOR)
}

// Seconds the cookie lives: to the latest validity end, at least an hour so a lapsed pass's own
// page can still say it lapsed, never past what a browser will honour.
export function rememberedUntil(validUntil: number[], now: number): number {
  const latest = Math.max(now, ...validUntil)
  return Math.min(BROWSER_MAX_SECONDS, Math.max(HOUR_SECONDS, latest - now))
}
