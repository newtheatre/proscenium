// Ids made on a device that is perhaps offline, in the kit's format (kit/ids.ts), so the server
// takes the same press or scan sent twice as one.
const ID_ALPHABET = '234567abcdefghijklmnopqrstuvwxyz' // not-policy: the kit's id alphabet
const TIME_CHARS = 10 // not-policy: the id format
const RANDOM_CHARS = 16 // not-policy: the id format

/** `<kind>_` and 26 characters, time first. */
export function deviceId(kind: string, now = Date.now()): string {
  let rest = now
  let time = ''
  for (let i = 0; i < TIME_CHARS; i++) {
    time = ID_ALPHABET[rest % ID_ALPHABET.length] + time
    rest = Math.floor(rest / ID_ALPHABET.length)
  }
  const random = [...crypto.getRandomValues(new Uint8Array(RANDOM_CHARS))].map(b => ID_ALPHABET[b % ID_ALPHABET.length]).join('')
  return `${kind}_${time}${random}`
}
