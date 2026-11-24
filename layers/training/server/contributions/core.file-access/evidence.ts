// Evidence files (E4): opened by the person they are about, or by a verifier at the course, whose
// opening is audited as a read.
import type { FileAccess } from '#modules/core'
import { mayReadEvidenceFile } from '../../evidence'

export default {
  canRead: (actor, record) => mayReadEvidenceFile(actor, record.id),
} satisfies FileAccess
