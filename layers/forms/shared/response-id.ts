// A response's id is made in the browser before the first save, so a submission that is retried
// can never store a second response. It has the kit's shape: `fres_`, ten characters of time and
// sixteen random ones. The server accepts no other shape, and an id is never a secret.
const ALPHABET = '234567abcdefghijklmnopqrstuvwxyz'

export function newResponseId(at: number = Date.now()): string {
  let time = ''
  let rest = Math.floor(at)
  for (let i = 0; i < 10; i++) {
    time = ALPHABET[rest % 32] + time
    rest = Math.floor(rest / 32)
  }
  const random = [...crypto.getRandomValues(new Uint8Array(16))].map(b => ALPHABET[b & 31]).join('')
  return `fres_${time}${random}`
}
