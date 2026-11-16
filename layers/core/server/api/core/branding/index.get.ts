// The brand, for every shell, email and PDF (C-35). Public: it is on the sign-in screen.
import { defineRoute } from '#kit'
import { getBrand } from '../../../brand/theme'

export default defineRoute({ public: true, rateLimit: 'default' }, () => getBrand())
