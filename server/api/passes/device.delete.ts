// D-138 criterion 5: a shared computer forgets every pass it was keeping (0260).
export default defineEventHandler((event) => {
  forgetPassQrToken(event)
  return { ok: true }
})
