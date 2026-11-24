// After issue: the PDF from the frozen row, then the email when the issuer asked for it (I-16, I-17).
// A failure leaves the invoice issued; the queue tries again.
import { defineJob } from '#kit'
import { afterIssue } from '../sending'

export default defineJob<{ invoiceId: string, send: boolean, byId: string | null }>(async (payload, unit) => {
  await afterIssue(unit, payload)
})
