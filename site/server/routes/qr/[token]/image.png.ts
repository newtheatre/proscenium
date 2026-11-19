// NNT ONLY, TEMPORARY: remove after 8 December 2026 (see site/app/utils/old-codes.ts).
// Emails sent by the old system show the ticket's QR code as a picture loaded from
// /qr/<token>/image.png. This draws the same code again (the old address, which the door's scanner
// turns into the imported booking), so those emails keep working at the door. Nothing is looked up:
// the picture holds only the address already in the email.
import { encode } from 'uqr'

const SCALE = 8 // not-policy: pixels per QR module in the picture
const TOKEN = /^[0-9a-f]{32}\.[\w-]+$/i

function crc32(bytes: Uint8Array): number {
  let crc = ~0
  for (const byte of bytes) {
    crc ^= byte
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1))
  }
  return ~crc >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(new TextEncoder().encode(type), 4)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

async function deflate(raw: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** A black-on-white greyscale PNG of a QR code. */
async function png(text: string): Promise<Uint8Array> {
  const { size, data } = encode(text, { border: 4, ecc: 'M' })
  const width = size * SCALE
  const raw = new Uint8Array((width + 1) * width)
  for (let y = 0; y < width; y++) {
    const row = data[Math.floor(y / SCALE)]!
    raw[y * (width + 1)] = 0 // filter: none
    for (let x = 0; x < width; x++) raw[y * (width + 1) + 1 + x] = row[Math.floor(x / SCALE)] ? 0 : 255
  }
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, width)
  view.setUint32(4, width)
  header.set([8, 0, 0, 0, 0], 8) // 8-bit greyscale
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', await deflate(raw)), chunk('IEND', new Uint8Array())]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token') ?? ''
  if (!TOKEN.test(token)) throw createError({ statusCode: 404 })
  const origin = getRequestURL(event).origin
  setResponseHeaders(event, { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' })
  return png(`${origin}/qr/${token}`)
})
