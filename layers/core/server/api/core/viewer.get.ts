// Who is looking: the name, the sides open to them and the entries they may open (UI-02).
import { defineRoute } from '#kit'
import { describeViewer } from '../../interface/viewer'

export default defineRoute({ public: true, rateLimit: 'default' }, async (_event, { actor }) => describeViewer(actor))
