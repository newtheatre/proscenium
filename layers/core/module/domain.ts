// The core domain's part of the core manifest (workstream 3, roadmap phase 1): organisation
// settings and the operating day, files, the brand, sending email, and the public site's points.
// module.ts spreads each field into the core manifest, beside foundations' and identity's parts.
import { z } from 'zod'
import { ability, call, code, defineAbilities, defineFacts, defineRecords, defineSettings, event, factDecl, job, point, record, setting, task, credentialDecl } from '#kit'
import type { SettingRule } from '#kit'
import { parseDuration } from '#kit/duration'

const organisation = 'core.organisation.edit'
const branding = 'core.branding.edit'
const filesConfigure = 'core.file.configure'
const sender = 'core.sender.manage'
const notificationConfigure = 'core.notification.configure'
const programmeConfigure = 'core.programme.configure'

export const settings = defineSettings('core', {
  // Organisation. The theatre's name, time zone, currency, language and day start are foundations'
  // (core.site.name, core.locale.*); the operating day (C-37) reads core.locale.day-start.
  'organisation.short-name': setting.text({ unset: true, maxLength: 30, change: organisation, audience: 'public', quotable: true }),
  'organisation.week-start': setting.choice({ default: 'monday', options: ['monday', 'sunday', 'saturday'], change: organisation, audience: 'public' }),
  'organisation.country': setting.choice({ default: 'GB', catalogue: 'country', change: organisation }),
  'organisation.contact-email': setting.text({ unset: true, maxLength: 254, change: organisation, audience: 'public', quotable: true }),
  'organisation.contact-phone': setting.text({ unset: true, maxLength: 30, change: organisation, audience: 'public', quotable: true }),
  'organisation.address': setting.text({ unset: true, maxLength: 300, change: organisation, audience: 'public', quotable: true }),
  'organisation.legal-name': setting.text({ unset: true, maxLength: 120, change: organisation, audience: 'public', quotable: true }),
  'organisation.charity-number': setting.text({ unset: true, maxLength: 30, change: organisation, audience: 'public', quotable: true }),
  // The day the theatre's own year ends, as MM-DD (31 July is 07-31). Identity's year-end expiry
  // of roles reads it; while it is unset, year end cannot be chosen as an expiry.
  'organisation.year-end': setting.text({ unset: true, maxLength: 5, change: organisation, onChange: 'confirm' }),

  // Brand (C-35, C-36). Saved together through PUT /api/core/branding, which raises the revision.
  // Light or dark is the interface's (core.appearance.*), not the brand's.
  'brand.accent': setting.colour({ default: '#2563eb', change: branding, audience: 'public' }),
  'brand.neutral': setting.choice({ default: 'slate', options: ['slate', 'stone', 'zinc', 'neutral'], change: branding, audience: 'public' }),
  'brand.display-font': setting.choice({ default: 'system', options: ['system', 'serif', 'rounded'], change: branding, audience: 'public' }),
  'brand.radius': setting.choice({ default: 'medium', options: ['none', 'small', 'medium', 'large'], change: branding, audience: 'public' }),
  'brand.credit-line': setting.boolean({ default: true, change: branding, audience: 'public' }),
  // Programme (part 6). The other programme settings arrive with the screens they shape.
  'programme.credits-public': setting.boolean({ default: true, change: programmeConfigure, audience: 'public', onChange: 'confirm' }),
  'programme.doors-before': setting.duration({ default: '30m', min: '0m', max: '3h', change: programmeConfigure, audience: 'public' }),
  'programme.default-running-time': setting.duration({ default: '2h', min: '10m', max: '8h', change: programmeConfigure }),
  // A performance's defaults (run presets concept, Matt 2026-11-17). Each is the theatre's; a space or
  // a production may set its own, and one performance may change it. Running time includes intervals.
  'programme.intervals': setting.integer({ default: 1, min: 0, max: 10, change: programmeConfigure }),
  'programme.interval-length': setting.duration({ default: '20m', min: '0m', max: '2h', change: programmeConfigure, audience: 'public' }),
  // The turnaround: a performance that starts sooner than this after another in the same exclusive
  // space ends counts as a clash. None by default.
  'programme.turnaround': setting.duration({ default: '0m', min: '0m', max: '12h', change: programmeConfigure }),
  // Whether the Add a run window starts with "Schedule them now" ticked.
  'programme.schedule-runs': setting.boolean({ default: true, change: programmeConfigure }),
  // The run preset the Add a run window starts from in a space without its own (core_run_presets).
  'programme.run-preset': setting.custom({ schema: z.string().regex(/^rps_[2-7a-z]{26}$/), unset: true, change: programmeConfigure }),
  // How long a production's team keeps its standing after the last performance ends (core.production-team).
  'programme.team-standing-after': setting.duration({ default: '30d', min: '0d', max: '365d', change: programmeConfigure }),
  'brand.logo': setting.reference({ record: 'core.file', change: branding, audience: 'public', managed: true }),
  'brand.logo-dark': setting.reference({ record: 'core.file', change: branding, audience: 'public', managed: true }),
  'brand.revision': setting.integer({ default: 0, min: 0, max: 1_000_000_000, change: branding, audience: 'public', managed: true }), // not-policy: a counter's ceiling

  // Files (C-23, C-36).
  'files.image-limit': setting.integer({ default: 10, min: 1, max: 50, unit: 'core.units.megabytes', change: filesConfigure, audience: 'signed-in' }),
  'files.document-limit': setting.integer({ default: 25, min: 1, max: 100, unit: 'core.units.megabytes', change: filesConfigure, audience: 'signed-in' }),
  'files.brand-limit': setting.integer({ default: 1, min: 1, max: 5, unit: 'core.units.megabytes', change: filesConfigure }),
  'files.deleted-retention': setting.duration({ default: '30d', min: '0d', max: '365d', change: filesConfigure, onChange: 'confirm' }),
  'files.upload-timeout': setting.duration({ default: '1h', min: '5m', max: '24h', change: filesConfigure }),

  // Sending email (C-27, C-28, C-32). verified-domain is written only by the verify route.
  'notifications.sending-domain': setting.text({ unset: true, maxLength: 253, change: sender, onChange: 'confirm' }),
  'notifications.verified-domain': setting.text({ unset: true, maxLength: 253, change: sender, managed: true, onChange: 'confirm' }),
  'notifications.email-footer': setting.text({ unset: true, maxLength: 500, multiline: true, change: 'core.template.edit' }),
  // The delivery pipeline (C-29), renamed from notifications.* so the engineering half sits on the
  // Advanced page. Each retry waits four times as long as the one before.
  'delivery.max-attempts': setting.integer({ replaces: 'core.notifications.max-attempts', default: 5, min: 1, max: 10, change: notificationConfigure }),
  'delivery.first-retry': setting.duration({ replaces: 'core.notifications.first-retry', default: '2m', min: '1m', max: '1h', change: notificationConfigure }),
  'delivery.stuck-after': setting.duration({ replaces: 'core.notifications.stuck-after', default: '10m', min: '5m', max: '2h', change: notificationConfigure }),
  'delivery.log-retention': setting.duration({ replaces: 'core.notifications.log-retention', default: '400d', min: '30d', max: '2555d', change: notificationConfigure, onChange: 'confirm' }),
  'delivery.inbox-retention': setting.duration({ replaces: 'core.notifications.inbox-retention', default: '180d', min: '30d', max: '730d', change: notificationConfigure, audience: 'signed-in', onChange: 'confirm' }),
  // C-52: the label put before the site's host when the sending domain is set up automatically.
  'notifications.sending-label': setting.text({ default: 'mail', maxLength: 63, change: sender, onChange: 'confirm' }),

  // Webhooks (group 6; C-49 to C-51). Each retry waits four times as long as the one before.
  'webhooks.max-attempts': setting.integer({ default: 8, min: 1, max: 15, change: 'core.webhook.manage' }),
  'webhooks.pause-after': setting.integer({ default: 20, min: 5, max: 100, change: 'core.webhook.manage' }),
  'webhooks.log-retention': setting.duration({ default: '30d', min: '1d', max: '365d', change: 'core.webhook.manage', onChange: 'confirm' }),
  'webhooks.timeout': setting.duration({ default: '10s', min: '1s', max: '30s', change: 'core.webhook.manage' }),
})

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] // not-policy: the calendar; 29 February is not every year's end

/** MM-DD that falls in every year. */
export function isDayOfYear(value: string): boolean {
  const match = /^(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const month = Number(match[1])
  const day = Number(match[2])
  return month >= 1 && month <= MONTH_DAYS.length && day >= 1 && day <= MONTH_DAYS[month - 1]!
}

export const settingRules: SettingRule[] = [
  { id: 'contact-email', check: s => s['organisation.contact-email'] === null || z.email().safeParse(s['organisation.contact-email']).success },
  { id: 'year-end', check: s => s['organisation.year-end'] === null || isDayOfYear(s['organisation.year-end']) },
  { id: 'sending-domain', check: s => s['notifications.sending-domain'] === null || /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(s['notifications.sending-domain']) },
  { id: 'stuck-after', check: s => parseDuration(s['delivery.stuck-after']) > parseDuration(s['delivery.first-retry']) },
  { id: 'sending-label', check: s => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(s['notifications.sending-label']) }, // not-policy: a DNS label
]

export const records = defineRecords('core', {
  'file': record({ table: 'core_files' }),
  'sender': record({ table: 'core_sender_identities' }),
  'vocabulary': record({ table: 'core_vocabularies' }),
  'season': record({ table: 'core_seasons' }),
  'production': record({ table: 'core_productions' }),
  // A grant on a production covers its performances.
  'performance': record({ table: 'core_performances', parent: 'core.production' }),
  'venue': record({ table: 'core_venues' }),
  'space': record({ table: 'core_spaces', parent: 'core.venue' }),
  'closure': record({ table: 'core_closures' }),
  'run-preset': record({ table: 'core_run_presets' }),
  'webhook': record({ table: 'core_webhooks' }),
})

export const abilities = defineAbilities('core', {
  'organisation.edit': ability({ risk: 'privileged' }),
  'branding.edit': ability({ risk: 'privileged' }),
  'file.configure': ability(),
  'sender.manage': ability({ risk: 'privileged' }),
  'template.edit': ability(),
  'notification.configure': ability(),
  // Granted on one vocabulary, it lets a module's manager look after that list only.
  'vocabulary.manage': ability({ on: 'core.vocabulary', grantAt: ['site', 'record'] }),
  // The programme (part 6). A grant of edit, publish or cancel on one production covers that production only.
  'production.view': ability({ on: 'core.production', grantAt: ['site', 'record'] }),
  'production.create': ability({ implies: ['production.view'] }),
  'production.edit': ability({ on: 'core.production', grantAt: ['site', 'record'], implies: ['production.view'] }),
  'production.publish': ability({ on: 'core.production', grantAt: ['site', 'record'], implies: ['production.edit'] }),
  'production.cancel': ability({ risk: 'privileged', on: 'core.production', grantAt: ['site', 'record'], implies: ['production.view'] }),
  // Scheduling and cancelling act on the production, so a grant on it covers all its dates (part 6).
  'performance.schedule': ability({ on: 'core.production', grantAt: ['site', 'record'], implies: ['production.view'] }),
  'performance.cancel': ability({ risk: 'privileged', on: 'core.production', grantAt: ['site', 'record'], implies: ['production.view'] }),
  'season.manage': ability(),
  'programme.configure': ability(),
  // A venue and its spaces. Creating a venue needs it site-wide; a grant on one venue covers its spaces.
  'venue.manage': ability({ on: 'core.venue', grantAt: ['site', 'record'] }),
  // Closures for the theatre, a venue or a space. Site-wide only: a closure cannot scope a grant.
  'closure.manage': ability(),
  // Webhooks send the theatre's events to an outside address, and their log shows what went where.
  'webhook.manage': ability({ risk: 'privileged', grantAt: ['site'] }),
})

const variableName = z.string().regex(/^[a-z][a-zA-Z0-9]*$/)
const wording = z.object({ subject: z.string().min(1).max(200), body: z.string().min(1).max(5000) }).strict() // not-policy: sane bounds for shipped wording

export const points = {
  /**
   * A message a module sends: to accounts with notify(), by email and to the inbox, or by email to
   * an address with no account yet with notifyAddress().
   */
  'core.notification-type': point({
    kind: 'data',
    schema: z.object({
      id: z.string().regex(/^[a-z][a-z0-9-]*\.[a-z0-9.-]+$/),
      category: z.enum(['transactional', 'optional']),
      side: z.enum(['audience', 'members']),
      channels: z.array(z.enum(['email', 'inbox'])).min(1),
      /** The inbox item's link: a path inside the application, which may use the type's variables. */
      link: z.string().startsWith('/').optional(),
      lane: z.enum(['prompt', 'bulk']).optional(),
      topic: z.string().optional(),
      // 'sealed' carries a secret, such as a link that signs someone in: encrypted at rest and email only.
      variables: z.record(variableName, z.enum(['url', 'sealed', 'text'])),
      wording: z.record(z.string(), wording).refine(w => 'en-GB' in w, 'wording needs en-GB'),
    }).strict()
      .refine(t => !Object.values(t.variables).includes('sealed') || (t.channels.length === 1 && t.channels[0] === 'email'), { message: 'a type with a sealed variable is sent by email only', path: ['channels'] }),
  }),
  /** A group of optional messages a person can switch off, and the unit a sender is chosen for. */
  'core.notification-topic': point({
    kind: 'data',
    schema: z.object({ id: z.string(), side: z.enum(['audience', 'members']), order: z.number().int().optional() }).strict(),
  }),
  /**
   * A place on a record that holds files. `owner` is a record type, or 'site' for the theatre's own
   * files such as its logo. `ability` is what a person needs on the owner to upload into it.
   */
  'core.file-slot': point({
    kind: 'data',
    schema: z.object({
      id: z.string(),
      owner: z.string(),
      ability: z.string(),
      many: z.boolean().optional(),
      // json, zip and csv only for a slot whose files the server makes.
      accepts: z.array(z.enum(['png', 'jpeg', 'webp', 'svg', 'pdf', 'json', 'zip', 'csv'])).min(1),
      limit: z.string(),
      access: z.enum(['public', 'signed_in', 'record']),
      textClass: z.enum(['public', 'internal', 'personal']),
      clean: z.boolean(),
      /** 'server': the files are made by the module with storeFile, never uploaded. */
      source: z.enum(['upload', 'server']).optional(),
    }).strict()
      .refine(s => s.source === 'server' || s.accepts.every(kind => !['json', 'zip', 'csv'].includes(kind)), { message: 'only a server slot takes json, zip or csv', path: ['accepts'] }),
  }),
  /**
   * What a change to a public record would touch, in plain words, for the confirmation before a
   * cancel, reschedule, move or capacity change: "42 tickets across 31 orders".
   */
  'core.change-impact': point({ kind: 'code', contract: 'change-impact' }),
  /**
   * Whether a module can live with a change: allow, or refuse with a reason and optionally a link to
   * its own screen where the matter is settled. Core runs every guard and stops on the first refusal.
   */
  'core.change-guard': point({ kind: 'code', contract: 'change-guard' }),
  /**
   * The booking button for a performance on the public pages, in one of five states. Box office
   * contributes. With no answer, the performance's external booking link is used, then the
   * production's; with neither, no button shows.
   */
  'core.booking-action': point({ kind: 'code', contract: 'booking-action' }),
  /** Whether an account may read the files of a record with `record` access, keyed by the record type. */
  'core.file-access': point({ kind: 'code', contract: 'file-access' }),
  /**
   * A table whose rows carry an operating day worked out from an instant. Recalculated when the
   * time zone or the rollover changes (C-37). Rows whose `done` column is set are left alone.
   */
  'core.operating-day': point({
    kind: 'data',
    schema: z.object({
      id: z.string(),
      table: z.string().regex(/^[a-z][a-z0-9_]*$/),
      key: z.string().regex(/^[a-z][a-z0-9_]*$/),
      instant: z.string().regex(/^[a-z][a-z0-9_]*$/),
      day: z.string().regex(/^[a-z][a-z0-9_]*$/),
      done: z.string().regex(/^[a-z][a-z0-9_]*$/).optional(),
    }).strict(),
  }),
  /**
   * A reusable list of options a module ships (group 3). Made, with its starting terms, the first
   * time it is needed; afterwards the theatre owns its terms and a release never rewrites them.
   */
  'core.vocabulary': point({
    kind: 'data',
    schema: z.object({
      id: z.string().regex(/^[a-z][a-z0-9-]*\.[a-z0-9-]+$/),
      label: z.string().min(1).max(80), // not-policy: the label's bounds
      description: z.string().max(300).optional(), // not-policy: the description's bound
      ordering: z.enum(['manual', 'alphabetical']).optional(),
      locked: z.boolean().optional(),
      termClass: z.enum(['public', 'internal']).optional(),
      // Headings, in order, for a grouped vocabulary: every term then names the heading it sits under.
      groups: z.array(z.string().min(1).max(80)).optional(), // not-policy: the label's bounds
      terms: z.array(z.object({
        slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
        label: z.string().min(1).max(80), // not-policy: the label's bounds
        description: z.string().max(300).optional(), // not-policy: the description's bound
        icon: z.string().optional(),
        group: z.string().optional(),
      }).strict()),
    }).strict(),
  }),
  /**
   * A component a fork's Markdown page may use, such as ::whats-on. `component` is its own name,
   * starting with its module's id (PublicSiteWhatsOn); `alias` is the short, kebab-case name a
   * content file writes, unique across the system. An entry without them names a component that is
   * already global under its id (core's `setting`). `setting` switches it off.
   */
  'core.public-component': point({
    kind: 'data',
    schema: z.object({
      id: z.string().regex(/^[a-z][a-z0-9-]*$/),
      component: z.string().regex(/^[A-Z][A-Za-z0-9]*$/).optional(),
      alias: z.string().regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/).optional(),
      description: z.string().optional(),
      setting: z.string().optional(),
    }).strict().refine(c => (c.component === undefined) === (c.alias === undefined), { message: 'component and alias come together', path: ['alias'] }),
  }),
}

/**
 * Core's one fact (part 6): the account is credited on the production, from the moment the credit is
 * linked until core.programme.team-standing-after has passed since its last performance ended. A
 * standing, so a cast member reaches the members' side; it grants nothing by default.
 */
export const facts = defineFacts('core', {
  'production-team': factDecl({ on: 'core.production', standing: true }),
})

export const contributes = {
  'core.file-slot': [
    { id: 'core.brand-logo', owner: 'site', ability: 'core.branding.edit', accepts: ['png', 'jpeg', 'webp', 'svg'], limit: 'core.files.brand-limit', access: 'public', textClass: 'public', clean: true },
    { id: 'core.brand-logo-dark', owner: 'site', ability: 'core.branding.edit', accepts: ['png', 'jpeg', 'webp', 'svg'], limit: 'core.files.brand-limit', access: 'public', textClass: 'public', clean: true },
    // A production's poster and its photos (C-23, C-24), managed on its own page.
    { id: 'core.production-poster', owner: 'core.production', ability: 'core.production.edit', accepts: ['png', 'jpeg', 'webp'], limit: 'core.files.image-limit', access: 'public', textClass: 'public', clean: true },
    { id: 'core.production-photos', owner: 'core.production', ability: 'core.production.edit', many: true, accepts: ['png', 'jpeg', 'webp'], limit: 'core.files.image-limit', access: 'public', textClass: 'public', clean: true },
  ],
  'core.erasure-handler': [{ id: 'core.files', file: 'files' }, { id: 'core.credits', file: 'credits' }],
  // A person told their credit is linked (question 5). Optional, so they can switch it off.
  'core.notification-topic': [{ id: 'core.credits', side: 'members' as const, order: 50 }],
  'core.notification-type': [{
    id: 'core.webhook.paused',
    category: 'transactional' as const,
    side: 'members' as const,
    channels: ['email' as const, 'inbox' as const],
    link: '/admin/webhooks',
    variables: { webhook: 'text' as const, failures: 'text' as const, link: 'url' as const },
    wording: {
      'en-GB': {
        subject: 'The webhook {{ webhook }} has been paused',
        body: 'The webhook {{ webhook }} failed {{ failures }} times in a row, so {{ theatre }} has stopped sending to it. Nothing more is sent until someone resumes it.\n\n[Open the webhook]({{ link }})',
      },
    },
  }, {
    id: 'core.credit.added',
    category: 'optional' as const,
    side: 'members' as const,
    channels: ['email' as const, 'inbox' as const],
    topic: 'core.credits',
    link: '/account/credits',
    variables: { production: 'text' as const, role: 'text' as const, link: 'url' as const },
    wording: {
      'en-GB': {
        subject: 'You are credited on {{ production }}',
        body: '{{ theatre }} has credited you as {{ role }} on {{ production }}.\n\nCredits are public unless you choose otherwise. You can make yours members only, or hide it, at any time.\n\n[See your credits]({{ link }})',
      },
    },
  }],
  // "My credits" on the members' side (part 5): shown to a person with at least one linked credit.
  'core.count': [{ id: 'core.my-credits', file: 'my-credits' }],
  'core.account-section': [
    { id: 'core.credits', target: 'account' as const, side: 'members' as const, ability: 'signed-in', component: 'CoreMyCredits', order: 50, to: '/account/credits', icon: 'i-lucide-scroll-text', count: 'core.my-credits', hideEmpty: true },
  ],
  'core.health-check': [{ id: 'core.sending-domain', file: 'sending-domain' }, { id: 'core.cloudflare-token', file: 'cloudflare-token' }, { id: 'core.email-events', file: 'email-events' }],
  'core.setup-step': [{ id: 'core.sender', required: true, to: '/admin/email', order: 20 }],
  'core.public-component': [{ id: 'setting' }],
  'core.record-resolver': [{ id: 'core.performance', file: 'performance' }],
  // The production page's "Ready to publish?" checklist (R-35).
  'core.record-check': ['summary', 'category', 'effects', 'advisories', 'poster', 'dates'].map(n => ({ id: `core.production-${n}`, file: `production-${n}` })),
  'core.operating-day': [{ id: 'core.performances', table: 'core_performances', key: 'id', instant: 'starts_at', day: 'operating_day', done: 'completed_at' }],
  // The vocabularies core ships (part 2, group 3). Labels are the theatre's to change afterwards.
  'core.vocabulary': [
    { id: 'core.production-category', label: 'Production categories', terms: terms(['play', 'Play'], ['musical', 'Musical'], ['comedy', 'Comedy'], ['dance', 'Dance'], ['music', 'Music'], ['workshop', 'Workshop'], ['social', 'Social'], ['other', 'Other']) },
    { id: 'core.credit-section', label: 'Credit sections', terms: terms(['cast', 'Cast'], ['creative-team', 'Creative team'], ['production-team', 'Production team'], ['crew', 'Crew'], ['band', 'Band']) },
    { id: 'core.advisory', label: 'Content warnings', description: 'What a story is about that someone may want to know first: shown on a production\'s page behind a "show" control.', groups: ['Violence and harm', 'Sexual content and abuse', 'Death and loss', 'Mental health', 'Discrimination and hate', 'Language and substances', 'Crime, war and conflict', 'Family and relationships', 'Medical and bodily'], terms: [
      { slug: 'violence', label: 'Violence', description: 'Physical fights, assault or brutality.', group: 'Violence and harm' },
      { slug: 'blood-gore', label: 'Blood and gore', description: 'Wounds, blood or graphic injury.', group: 'Violence and harm' },
      { slug: 'weapons', label: 'Weapons', description: 'Knives, guns or other weapons carried or used.', group: 'Violence and harm' },
      { slug: 'torture', label: 'Torture', description: 'Deliberate infliction of pain on a person.', group: 'Violence and harm' },
      { slug: 'animal-harm', label: 'Harm to animals', description: 'Animals hurt or killed, or their death described.', group: 'Violence and harm' },
      { slug: 'child-harm', label: 'Harm to children', description: 'Children shown or described being hurt.', group: 'Violence and harm' },
      { slug: 'sexual-content', label: 'Sexual content', description: 'Sex shown, simulated or described, or nudity.', group: 'Sexual content and abuse' },
      { slug: 'nudity', label: 'Nudity', description: 'Performers undressed on stage.', group: 'Sexual content and abuse' },
      { slug: 'sexual-violence', label: 'Sexual violence', description: 'Rape or sexual assault, shown or described.', group: 'Sexual content and abuse' },
      { slug: 'sexual-harassment', label: 'Sexual harassment', description: 'Unwanted sexual attention or comments.', group: 'Sexual content and abuse' },
      { slug: 'child-abuse', label: 'Child abuse', description: 'Abuse of a child, shown or described.', group: 'Sexual content and abuse' },
      { slug: 'grooming', label: 'Grooming', description: 'An adult building trust with a child to abuse them.', group: 'Sexual content and abuse' },
      { slug: 'death', label: 'Death', description: 'A character dies or a death is discussed.', group: 'Death and loss' },
      { slug: 'grief', label: 'Grief and bereavement', description: 'Mourning, funerals or the loss of someone close.', group: 'Death and loss' },
      { slug: 'child-death', label: 'Death of a child', description: 'The death of a child or baby.', group: 'Death and loss' },
      { slug: 'terminal-illness', label: 'Terminal illness', description: 'A character is dying of illness.', group: 'Death and loss' },
      { slug: 'pregnancy-loss', label: 'Pregnancy loss', description: 'Miscarriage or stillbirth.', group: 'Death and loss' },
      { slug: 'murder', label: 'Murder', description: 'A killing, planned or carried out.', group: 'Death and loss' },
      { slug: 'self-harm', label: 'Self-harm', description: 'Deliberate injury to oneself.', group: 'Mental health' },
      { slug: 'suicide', label: 'Suicide', description: 'Suicide, attempted or completed, or suicidal thoughts.', group: 'Mental health' },
      { slug: 'eating-disorders', label: 'Eating disorders', description: 'Disordered eating or body image.', group: 'Mental health' },
      { slug: 'depression', label: 'Depression', description: 'Persistent low mood and its effects.', group: 'Mental health' },
      { slug: 'anxiety', label: 'Anxiety and panic', description: 'Anxiety, panic attacks or phobias.', group: 'Mental health' },
      { slug: 'psychosis', label: 'Psychosis', description: 'Delusions, hallucinations or a break with reality.', group: 'Mental health' },
      { slug: 'ptsd', label: 'Trauma and PTSD', description: 'Flashbacks or the lasting effects of trauma.', group: 'Mental health' },
      { slug: 'racism', label: 'Racism', description: 'Racist language, attitudes or acts.', group: 'Discrimination and hate' },
      { slug: 'homophobia', label: 'Homophobia and transphobia', description: 'Hostility to gay, lesbian, bi or trans people.', group: 'Discrimination and hate' },
      { slug: 'sexism', label: 'Sexism and misogyny', description: 'Contempt for or mistreatment of women.', group: 'Discrimination and hate' },
      { slug: 'ableism', label: 'Ableism', description: 'Prejudice against disabled people.', group: 'Discrimination and hate' },
      { slug: 'antisemitism', label: 'Antisemitism', description: 'Hostility to Jewish people.', group: 'Discrimination and hate' },
      { slug: 'islamophobia', label: 'Islamophobia', description: 'Hostility to Muslims.', group: 'Discrimination and hate' },
      { slug: 'slurs', label: 'Slurs', description: 'Offensive terms for a group of people.', group: 'Discrimination and hate' },
      { slug: 'strong-language', label: 'Strong language', description: 'Swearing, including strong swear words.', group: 'Language and substances' },
      { slug: 'drug-use', label: 'Drug use', description: 'Illegal or recreational drugs used or discussed.', group: 'Language and substances' },
      { slug: 'alcohol', label: 'Alcohol misuse', description: 'Heavy drinking or alcoholism.', group: 'Language and substances' },
      { slug: 'smoking', label: 'Smoking', description: 'Cigarettes or vaping on stage.', group: 'Language and substances' },
      { slug: 'addiction', label: 'Addiction', description: 'Dependence on a substance or behaviour.', group: 'Language and substances' },
      { slug: 'gambling', label: 'Gambling', description: 'Betting or gambling addiction.', group: 'Language and substances' },
      { slug: 'war', label: 'War', description: 'Armed conflict and its effects.', group: 'Crime, war and conflict' },
      { slug: 'terrorism', label: 'Terrorism', description: 'Terrorist acts or their aftermath.', group: 'Crime, war and conflict' },
      { slug: 'genocide', label: 'Genocide', description: 'Mass killing of a people.', group: 'Crime, war and conflict' },
      { slug: 'kidnap', label: 'Kidnap and imprisonment', description: 'Someone held against their will.', group: 'Crime, war and conflict' },
      { slug: 'police-violence', label: 'Police violence', description: 'Force used by police or officials.', group: 'Crime, war and conflict' },
      { slug: 'theft', label: 'Theft and robbery', description: 'Stealing, burglary or armed robbery.', group: 'Crime, war and conflict' },
      { slug: 'human-trafficking', label: 'Human trafficking', description: 'People bought, sold or forced to work.', group: 'Crime, war and conflict' },
      { slug: 'domestic-abuse', label: 'Domestic abuse', description: 'Violence or control within a home.', group: 'Family and relationships' },
      { slug: 'coercive-control', label: 'Coercive control', description: 'One person dominating another person\'s life.', group: 'Family and relationships' },
      { slug: 'infidelity', label: 'Infidelity', description: 'Cheating on a partner.', group: 'Family and relationships' },
      { slug: 'divorce', label: 'Divorce and separation', description: 'The end of a marriage or partnership.', group: 'Family and relationships' },
      { slug: 'neglect', label: 'Neglect', description: 'A person left without care they need.', group: 'Family and relationships' },
      { slug: 'bullying', label: 'Bullying', description: 'Repeated cruelty to a person.', group: 'Family and relationships' },
      { slug: 'medical-procedures', label: 'Medical procedures', description: 'Operations, injections or hospital scenes.', group: 'Medical and bodily' },
      { slug: 'needles', label: 'Needles', description: 'Needles or injections shown.', group: 'Medical and bodily' },
      { slug: 'childbirth', label: 'Childbirth', description: 'Labour or birth shown or described.', group: 'Medical and bodily' },
      { slug: 'abortion', label: 'Abortion', description: 'A termination, shown or discussed.', group: 'Medical and bodily' },
      { slug: 'dementia', label: 'Dementia', description: 'Memory loss and confusion in later life.', group: 'Medical and bodily' },
      { slug: 'bodily-fluids', label: 'Bodily fluids', description: 'Vomit, urine or similar on stage.', group: 'Medical and bodily' },
      { slug: 'religious-abuse', label: 'Religious abuse', description: 'Harm done in the name of religion.', group: 'Medical and bodily' },
    ] },
    { id: 'core.staging-effect', label: 'Staging effects', description: 'What the room does to the audience: always shown on a production\'s page, because it is safety information.', terms: [
      { slug: 'strobe', label: 'Strobe lighting', description: 'Rapid flashing lights.', icon: 'i-lucide-zap' },
      { slug: 'haze', label: 'Haze or smoke', description: 'Haze, fog or smoke machines.', icon: 'i-lucide-cloud-fog' },
      { slug: 'loud-noise', label: 'Loud noises', description: 'Sudden or sustained loud sound.', icon: 'i-lucide-volume-2' },
      { slug: 'gunshots', label: 'Gunshots', description: 'Gunfire or similar bangs, including blanks.', icon: 'i-lucide-target' },
      { slug: 'pyrotechnics', label: 'Pyrotechnics', description: 'Flame, sparks or smoke from fireworks.', icon: 'i-lucide-flame' },
      { slug: 'naked-flame', label: 'Naked flame', description: 'Candles, lighters or open fire.', icon: 'i-lucide-flame-kindling' },
      { slug: 'flashing-lights', label: 'Flashing lights', description: 'Camera flashes or repeated bright bursts.', icon: 'i-lucide-lightbulb' },
      { slug: 'darkness', label: 'Blackouts and darkness', description: 'Moments of complete or near darkness.', icon: 'i-lucide-moon' },
      { slug: 'audience-participation', label: 'Audience participation', description: 'The audience may be spoken to or involved.', icon: 'i-lucide-users' },
      { slug: 'moving-seats', label: 'Moving audience', description: 'The audience is asked to move or stand.', icon: 'i-lucide-footprints' },
      { slug: 'loose-materials', label: 'Dust, powder or liquids', description: 'Powder, water or other material may reach the front rows.', icon: 'i-lucide-droplets' },
    ] },
    { id: 'core.access-feature', label: 'Access at performances', description: 'What a performance offers, such as captioning.', terms: terms(['captioned', 'Captioned'], ['sign-language', 'Sign-language interpreted'], ['audio-described', 'Audio described'], ['relaxed', 'Relaxed'], ['touch-tour', 'Touch tour']) },
    { id: 'core.space-kind', label: 'Kinds of space', terms: terms(['auditorium', 'Auditorium'], ['studio', 'Studio'], ['rehearsal-room', 'Rehearsal room'], ['front-of-house', 'Front of house'], ['workshop', 'Workshop'], ['store', 'Store'], ['other', 'Other']) },
    { id: 'core.place-access', label: 'Access at venues', description: 'What a building offers, such as step-free access.', terms: terms(['step-free', 'Step-free access', 'i-lucide-accessibility'], ['wheelchair-spaces', 'Wheelchair spaces', 'i-lucide-armchair'], ['lift', 'Lift', 'i-lucide-arrow-up-down'], ['accessible-toilet', 'Accessible toilet', 'i-lucide-toilet'], ['changing-places', 'Changing Places toilet', 'i-lucide-bath'], ['hearing-loop', 'Hearing loop', 'i-lucide-ear'], ['accessible-parking', 'Accessible parking', 'i-lucide-circle-parking'], ['assistance-dogs', 'Assistance dogs welcome', 'i-lucide-dog'], ['quiet-space', 'Quiet space', 'i-lucide-leaf'], ['baby-changing', 'Baby changing', 'i-lucide-baby']) },
    { id: 'core.cancel-reason', label: 'Reasons for cancelling', terms: terms(['illness', 'Illness'], ['technical', 'Technical problem'], ['venue-unavailable', 'Venue unavailable'], ['weather', 'Weather'], ['low-sales', 'Low sales'], ['other', 'Other']) },
  ],
}

function terms(...list: [slug: string, label: string, icon?: string][]) {
  return list.map(([slug, label, icon]) => (icon ? { slug, label, icon } : { slug, label }))
}

/** The public fields of a production, as core.production.updated names them. */
export const PRODUCTION_PUBLIC_FIELDS = ['title', 'subtitle', 'summary', 'description', 'categoryTermId', 'seasonId', 'companyName', 'ageMin', 'ageRestricted', 'effectsConfirmedNone', 'advisoriesConfirmedNone', 'contentNote', 'runningMinutes', 'intervalCount', 'externalBookingUrl', 'creditsPublic', 'listed', 'slug', 'advisories', 'effects', 'credits'] as const

export const announces = {
  'core.branding.changed': event({ version: 1, payload: z.object({ revision: z.number().int() }), internal: true }),
  'core.season.published': event({ version: 1, payload: z.object({ seasonId: z.string() }), internal: false }),
  'core.season.archived': event({ version: 1, payload: z.object({ seasonId: z.string() }), internal: false }),
  'core.production.published': event({ version: 1, payload: z.object({ productionId: z.string() }), internal: false }),
  'core.production.updated': event({ version: 1, payload: z.object({
    productionId: z.string(),
    fields: z.array(z.enum(PRODUCTION_PUBLIC_FIELDS)),
    // What a change to the guidance added: term ids only, never people, so it may leave in a webhook.
    guidanceAdded: z.object({ effectTermIds: z.array(z.string()), warnings: z.array(z.object({ termId: z.string(), level: z.enum(['mentioned', 'discussed', 'depicted']) })) }).optional(),
  }), internal: false }),
  'core.production.withdrawn': event({ version: 1, payload: z.object({ productionId: z.string() }), internal: false }),
  'core.production.cancelled': event({ version: 1, payload: z.object({ productionId: z.string(), reason: code() }), internal: false }),
  'core.performance.scheduled': event({ version: 1, payload: z.object({ performanceId: z.string(), productionId: z.string(), reinstated: z.boolean() }), internal: false }),
  'core.performance.rescheduled': event({ version: 1, payload: z.object({ performanceId: z.string(), productionId: z.string(), oldStartsAt: z.number().int(), oldEndsAt: z.number().int(), startsAt: z.number().int(), endsAt: z.number().int() }), internal: false }),
  'core.performance.moved': event({ version: 1, payload: z.object({ performanceId: z.string(), productionId: z.string(), oldVenueId: z.string(), oldSpaceId: z.string(), venueId: z.string(), spaceId: z.string() }), internal: false }),
  'core.performance.capacity-changed': event({ version: 1, payload: z.object({ performanceId: z.string(), productionId: z.string(), oldCapacity: z.number().int().nullable(), capacity: z.number().int().nullable() }), internal: false }),
  'core.performance.cancelled': event({ version: 1, payload: z.object({ performanceId: z.string(), productionId: z.string(), reason: code() }), internal: false }),
  'core.performance.completed': event({ version: 1, payload: z.object({ performanceId: z.string(), productionId: z.string() }), internal: false }),
  'core.venue.archived': event({ version: 1, payload: z.object({ venueId: z.string() }), internal: false }),
  'core.space.archived': event({ version: 1, payload: z.object({ spaceId: z.string(), venueId: z.string() }), internal: false }),
  // Whether the theatre runs a space changed (R-36): a bar or a hire may care.
  'core.space.managed-changed': event({ version: 1, payload: z.object({ spaceId: z.string(), venueId: z.string(), managed: z.boolean() }), internal: false }),
  'core.closure.created': event({ version: 1, payload: z.object({ closureId: z.string(), venueId: z.string().nullable(), spaceId: z.string().nullable(), startsAt: z.number().int(), endsAt: z.number().int(), blocksPerformances: z.boolean() }), internal: false }),
  'core.closure.removed': event({ version: 1, payload: z.object({ closureId: z.string(), venueId: z.string().nullable(), spaceId: z.string().nullable(), startsAt: z.number().int(), endsAt: z.number().int(), blocksPerformances: z.boolean() }), internal: false }),
  'core.file.ready': event({ version: 1, payload: z.object({ fileId: z.string(), slot: code() }), internal: true }),
  'core.file.rejected': event({ version: 1, payload: z.object({ fileId: z.string(), reason: code() }), internal: true }),
  'core.file.deleted': event({ version: 1, payload: z.object({ fileId: z.string(), slot: code() }), internal: true }),
  'core.term.retired': event({ version: 1, payload: z.object({ termId: z.string(), vocabulary: code() }), internal: true }),
  'core.delivery.failed': event({ version: 1, payload: z.object({ notificationId: z.string(), typeKey: code(), channel: z.enum(['email', 'inbox']) }), internal: true }),
  'core.delivery.bounced': event({ version: 1, payload: z.object({ notificationId: z.string(), accountId: z.string().nullable() }), internal: true }),
  'core.delivery.complained': event({ version: 1, payload: z.object({ notificationId: z.string(), accountId: z.string().nullable() }), internal: true }),
  'core.address.suppressed': event({ version: 1, payload: z.object({ reason: z.enum(['hard_bounce', 'complaint', 'manual']) }), internal: true }),
  // Never sent to webhooks itself, so a failing webhook cannot feed its own failures.
  'core.webhook.paused': event({ version: 1, payload: z.object({ webhookId: z.string(), failures: z.number().int() }), internal: true }),
  'core.term.merged': event({ version: 1, payload: z.object({ termId: z.string(), vocabulary: code(), intoId: z.string() }), internal: true }),
}

export const listens = {
  // Every event not marked internal: core's webhook sender, the one listener of its kind.
  'deliverable': 'queue-webhooks',
  'core.setting.changed': 'recompute-on-change',
  'core.module.enabled': 'seed-vocabularies',
}

export const jobs = {
  'core.check-file': job({ payload: z.object({ fileId: z.string() }) }),
  'core.recompute-days': job({ payload: z.object({}), lane: 'bulk' }),
  'core.send-notifications': job({ payload: z.object({ deliveryIds: z.array(z.string()).min(1) }) }),
  'core.create-run': job({ payload: z.object({ runId: z.string() }) }),
  'core.send-webhook': job({ payload: z.object({ deliveryIds: z.array(z.string()).min(1) }), lane: 'bulk' }),
  'core.verify-sending-domain': job({ payload: z.object({ domain: z.string(), tries: z.number().int().min(1) }) }),
}

// C-52: optional. Without it the sending domain is set up by hand in the Cloudflare dashboard. Typed
// on Admin > Email sending (Matt, 17 November), or set as a Worker secret of the same name.
export const credentials = {
  CORE_CLOUDFLARE_TOKEN: credentialDecl({ needed: 'optional', manage: 'core.sender.manage' }),
}

export const calls = {
  'core.create-sending-domain': call({ reconcileAfter: '5m' }),
}

export const tasks = {
  'core.sweep-files': task({ every: '1h' }),
  'core.sweep-notifications': task({ every: '5m' }),
  'core.complete-performances': task({ every: '5m' }),
}
