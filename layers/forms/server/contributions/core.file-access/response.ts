// File answers on a response: read by whoever forms lets read the response's answers, the person
// who sent it or uploaded the file, and a reviewer assigned to it; never by somebody with a conflict.
import type { FileAccess } from '#modules/core'
import { mayReadAnswerFile } from '../../files'

export default {
  canRead: (actor, record, file) => mayReadAnswerFile(actor, record.id, file.id),
} satisfies FileAccess
