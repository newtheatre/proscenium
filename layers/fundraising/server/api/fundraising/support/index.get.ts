// P1 Support us: open campaigns and the funds a donor may choose.
import { defineRoute } from '#kit'
import { supportPage } from '../../../support'

export default defineRoute({ public: true, rateLimit: 'default' }, () => supportPage())
