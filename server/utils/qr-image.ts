import type { H3Event } from 'h3'

// The PNG an email's <img> fetches (D-108 criterion 2). The token in the path is the same
// credential the email already carries, so the image discloses nothing the link did not.
export function sendQrImage(event: H3Event, url: string): Uint8Array {
  const { bytes } = qrPng(url)
  setResponseHeaders(event, {
    'Content-Type': 'image/png',
    'Content-Disposition': 'inline; filename="booking-qr.png"',
    'Content-Length': String(bytes.length),
    'Cache-Control': 'private, max-age=86400',
    'Content-Security-Policy': 'default-src \'none\'',
  })
  return bytes
}

// One answer for a forged token and an unknown one, so the route is not an oracle.
export function refuseQrImage(): never {
  throw createError({ statusCode: 404, statusMessage: 'Not found' })
}
