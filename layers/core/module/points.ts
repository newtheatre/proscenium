// The points the core offers (Foundations part 4).
import { z } from 'zod'
import { point } from '#kit'

const ability = z.union([z.string(), z.array(z.string()).min(1)])

export const points = {
  'core.navigation': point({
    kind: 'data',
    // A menu, not a shell: the account menu sits in the public shell. 'signed-in' as the ability
    // is for account entries every signed-in person sees.
    schema: z.object({
      id: z.string(),
      menu: z.enum(['account', 'members', 'console', 'admin', 'live']),
      to: z.string().startsWith('/'),
      icon: z.string(),
      ability: ability.optional(),
      order: z.number().int().optional(),
      group: z.string().optional(),
      section: z.enum(['everyday', 'setup']).optional(),
      count: z.string().optional(),
      hideEmpty: z.boolean().optional(),
      attention: z.string().optional(),
      match: z.string().optional(),
      // A tab of a module's page in Admin: the console entries or groups whose settings window shows it.
      settingsIn: z.array(z.string()).min(1).optional(),
      // An account entry where somebody who is not a member learns how to become one: the members' area sends them there.
      forNonMembers: z.boolean().optional(),
    }).strict()
      .refine(e => !e.forNonMembers || e.menu === 'account', { message: 'only an account entry may be forNonMembers', path: ['forNonMembers'] })
      .refine(e => e.ability !== 'signed-in' || e.menu === 'account', { message: "only an account entry may give ability 'signed-in'", path: ['ability'] })
      .refine(e => !e.hideEmpty || e.count !== undefined, { message: 'hideEmpty needs a count', path: ['hideEmpty'] })
      .refine(e => e.menu !== 'admin' || e.group !== undefined || e.to === '/admin', { message: 'an admin entry names one of the admin groups; only the Overview, /admin, has none', path: ['group'] })
      .refine(e => e.menu !== 'account' || e.group === undefined || e.group === 'theatre' || e.group === 'account', { message: "an account entry's group is 'theatre' or 'account'", path: ['group'] })
      .refine(e => e.attention === undefined || e.menu === 'account', { message: 'only an account entry marks things that need the person', path: ['attention'] })
      .refine(e => e.settingsIn === undefined || (e.menu === 'admin' && e.to.startsWith('/admin/modules/')), { message: "only a tab of a module's page in Admin names where the settings window shows it", path: ['settingsIn'] }),
  }),
  // A console group is declared once, by the module that owns it. A theatre's own module places its
  // group with `before` or `after`; the platform's own groups keep the fixed order. `menu: 'admin'`
  // declares one of Admin's groups instead (R-33).
  'core.navigation-group': point({
    kind: 'data',
    schema: z.object({
      id: z.string(),
      menu: z.enum(['console', 'admin']).optional(),
      icon: z.string(),
      order: z.number().int().optional(),
      before: z.string().optional(),
      after: z.string().optional(),
    }).strict(),
  }),
  // A record type the command palette can search: the module's own search route takes `q` and
  // answers ids; the palette shows them through the type's `core.record-resolver`, so every type
  // looks the same and the module supplies no markup.
  'core.search-source': point({
    kind: 'data',
    schema: z.object({
      id: z.string(),
      record: z.string(),
      ability,
      route: z.string().startsWith('/api/'),
      shells: z.array(z.enum(['console', 'members', 'admin'])).min(1).default(['console']),
    }).strict(),
  }),
  // A common action offered in the palette (and on an empty home): a place to go, with words that find it.
  'core.quick-action': point({
    kind: 'data',
    schema: z.object({
      id: z.string(),
      to: z.string().startsWith('/'),
      icon: z.string(),
      ability,
      keywords: z.string().optional(),
    }).strict(),
  }),
  // A section of My account (or of a member's own pages, or of a person's page in the console). The
  // component is a name the app resolves; `count` with the section's own hiding is the same as an entry's.
  'core.account-section': point({
    kind: 'data',
    schema: z.object({
      id: z.string(),
      target: z.enum(['account', 'console-person']),
      side: z.enum(['audience', 'members']),
      ability,
      component: z.string(),
      order: z.number().int(),
      to: z.string().startsWith('/').optional(),
      icon: z.string().optional(),
      count: z.string().optional(),
      hideEmpty: z.boolean().optional(),
    }).strict().refine(e => !e.hideEmpty || e.count !== undefined, { message: 'hideEmpty needs a count', path: ['hideEmpty'] }),
  }),
  // A card on a home page: one fact and one action, drawn by the module's own component. Cards are
  // sorted overdue, today, information, and a card whose count is zero is not shown.
  'core.home-card': point({
    kind: 'data',
    schema: z.object({
      id: z.string(),
      home: z.enum(['console', 'members', 'tonight', 'admin']),
      ability,
      component: z.string(),
      urgency: z.enum(['overdue', 'today', 'info']),
      count: z.string().optional(),
    }).strict(),
  }),
  // A tab another module adds to a record page. The owner's own tabs come first. The label is
  // `<module>.record-tabs.<name>.label`; the component receives `recordId` and nothing else.
  'core.record-tab': point({
    kind: 'data',
    schema: z.object({
      id: z.string(),
      record: z.string(),
      ability,
      component: z.string(),
      order: z.number().int(),
      count: z.string().optional(),
    }).strict(),
  }),
  // One fact another module adds to a record's summary strip, after the owner's own. Read-only: the
  // component receives `recordId` and nothing else, and says its own label and value.
  'core.record-fact': point({
    kind: 'data',
    schema: z.object({ id: z.string(), record: z.string(), ability, component: z.string(), order: z.number().int() }).strict(),
  }),
  // One line another module adds to a record's side-panel checklist ("Prices set" on a production).
  // It reports only; whether a missing line stops anything stays the owner's own rule. The file
  // exports { record, ability, order, check(recordId) }.
  'core.record-check': point({ kind: 'code', contract: 'record-check' }),
  // A column another module adds to a list, after the owner's own. The component receives the list
  // id, the page's query and the row's id, and fetches once for the page. The label is
  // `<module>.list-columns.<name>.label`.
  'core.list-column': point({
    kind: 'data',
    schema: z.object({ id: z.string(), list: z.string(), ability, component: z.string(), order: z.number().int() }).strict(),
  }),
  // A registered count, shown beside a menu entry or on a card. A module registers its own; another
  // module's is named by it. The contribution says how to count for the person asking.
  'core.count': point({ kind: 'code', contract: 'count' }),
  // A figure beside each of tonight's performances on the Tonight hub (sold, in, taken at the tills),
  // read for one performance and left out for anyone without its ability there.
  'core.tonight-figure': point({ kind: 'code', contract: 'tonight-figure' }),
  // Something on My account's overview that needs the person (an address to confirm, a renewal
  // that is open), for the person asking. A notice that fails is left out, never the page.
  'core.account-notice': point({ kind: 'code', contract: 'account-notice' }),
  'core.setup-step': point({
    kind: 'data',
    schema: z.object({ id: z.string(), required: z.boolean(), to: z.string().startsWith('/'), order: z.number().int().optional() }).strict(),
  }),
  'core.health-check': point({ kind: 'code', contract: 'health-check' }),
  // A role made the first time its module is switched on, so a fresh install has the usual ones. The
  // key is the role's key: a theatre that has a role of that key already (archived too) keeps its own.
  // From then on the role is the theatre's to change or archive. Abilities a module that is absent
  // declares are left out.
  'core.role-preset': point({
    kind: 'data',
    schema: z.object({
      id: z.string().regex(/^[a-z][a-z0-9-]*\.[a-z0-9-]+$/),
      key: z.string().regex(/^[a-z][a-z0-9-]*$/),
      name: z.string().min(1).max(60), // not-policy: as a role's name
      description: z.string().max(300).optional(), // not-policy: as a role's description
      abilities: z.array(z.string()).min(1),
      opensMembersArea: z.boolean().optional(),
    }).strict(),
  }),
  /** A source of verdicts on stored conditions, under its module's id (Formats tab, Requirements). */
  'core.requirement': point({ kind: 'code', contract: 'requirement-source' }),
  'core.erasure-handler': point({ kind: 'code', contract: 'erasure-handler' }),
  'core.record-resolver': point({ kind: 'code', contract: 'record-resolver' }),
  'core.privacy-record': point({
    kind: 'data',
    schema: z.object({ id: z.string(), holds: z.string(), why: z.string(), keptFor: z.string() }).strict(),
  }),
}
