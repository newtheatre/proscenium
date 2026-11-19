// NNT ONLY, TEMPORARY: remove after the last show booked on the old system (8 December 2026).
//
// Tickets booked on the old system carry a QR code of an address, such as
// https://newtheatre.org.uk/qr/<booking id>.<signature> or .../passes/pass:<pass id>.<signature>.
// The old system's signing secret is lost, so the import stored each booking under its id alone
// (and each pass under `pass:<id>`). This turns a scanned old code into that id; anything else is
// passed through unchanged.
const OLD_BOOKING = /^https?:\/\/[^/]+\/qr\/([0-9a-f]{32})\.[\w-]+\/?$/i
const OLD_PASS = /^https?:\/\/[^/]+\/passes\/(pass:[\w-]+)\.[\w-]+\/?$/i

export function fromOldCode(code: string): string {
  const text = code.trim()
  const booking = OLD_BOOKING.exec(text)
  if (booking) return booking[1]!.toLowerCase()
  const pass = OLD_PASS.exec(text)
  if (pass) return pass[1]!
  return code
}
