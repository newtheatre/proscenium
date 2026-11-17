// The public site (core domain specification, parts 4 and 6): the public pages, feeds and content
// components. It owns no tables: it reads the programme through the core's public services. With it
// switched off, its routes answer "not found" and the core-owned prefixes /whats-on and /shows stay
// reserved (R-07). This file grows with the build; it declares only what the code so far uses.
import { ability, defineAbilities, defineModule, defineSettings, setting } from '#kit'

const change = 'public-site.site.configure'

export default defineModule({
  id: 'public-site',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',

  settings: defineSettings('public-site', {
    // Off makes every past production answer "not found" (C-47). Current shows are unaffected.
    'archive.public': setting.boolean({ default: true, change, audience: 'public', onChange: 'confirm' }),
    // The earliest year the archive shows; unset shows everything. A year still to come shows nothing yet.
    'archive.from-year': setting.integer({ unset: true, min: 1800, max: 9999, change, audience: 'public' }), // not-policy: the bounds of a year
    // Keep a cancelled performance listed, marked as cancelled, until its date passes.
    'listing.cancelled-visible': setting.boolean({ default: true, change, audience: 'public' }),
  }),
  settingGroups: {
    archive: { place: 'admin' },
    listing: { place: 'admin' },
  },

  contributes: {
    // ::whats-on in a theatre's own page, such as the starter home page.
    'core.public-component': [
      { id: 'whats-on', component: 'PublicSiteWhatsOn', alias: 'whats-on', description: 'What is on: every production with a date to come, or the soonest few (limit), narrowed by category, season or venue (slugs), as a grid or a list (layout).' },
    ],
  },

  abilities: defineAbilities('public-site', {
    'site.configure': ability(),
  }),
})
