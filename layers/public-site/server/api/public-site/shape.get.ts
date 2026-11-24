// The public site's shape for the shell (C-71, C-72): another module's front page, its menu and
// footer entries, while it applies. Public, as the menu is.
import { defineRoute } from '#kit'
import { siteShape } from '../../shape'

export default defineRoute({ public: true, rateLimit: 'default' }, () => siteShape())
