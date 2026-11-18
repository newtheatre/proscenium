// The settings a browser may know: those whose audience is public, with the text a content token
// shows for each quotable one. A module that is off tells the browser nothing.
import { defineRoute } from '#kit'
import { publicSettings } from '../../../policies/service'

export default defineRoute({ public: true, rateLimit: 'default' }, () => publicSettings())
