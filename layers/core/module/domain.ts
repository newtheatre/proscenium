// The core domain's part of the core manifest (workstream 3, roadmap phase 1): organisation
// settings and the operating day, files, the brand, sending email, and the public site's points.
// module.ts spreads each field into the core manifest, beside foundations' and identity's parts.
import { z } from 'zod'
import { ability, code, defineAbilities, defineRecords, defineSettings, event, job, point, record, setting, task } from '#kit'
import type { SettingRule } from '#kit'

const organisation = 'core.organisation.edit'
const branding = 'core.branding.edit'
const filesConfigure = 'core.file.configure'
const sender = 'core.sender.manage'

export const settings = defineSettings('core', {
  // Organisation (C-37). The time zone and currency stay foundations' core.locale.* settings, which
  // the scheduler already reads; the specification's core.organisation.time-zone is that one.
  'organisation.name': setting.text({ unset: true, maxLength: 80, change: organisation, audience: 'public', quotable: true }),
  'organisation.short-name': setting.text({ unset: true, maxLength: 30, change: organisation, audience: 'public', quotable: true }),
  'organisation.day-rollover': setting.time({ default: '04:00', change: organisation }),
  'organisation.week-start': setting.choice({ default: 'monday', options: ['monday', 'sunday', 'saturday'], change: organisation, audience: 'public' }),
  'organisation.country': setting.text({ default: 'GB', maxLength: 2, change: organisation }),
  'organisation.contact-email': setting.text({ unset: true, maxLength: 254, change: organisation, audience: 'public', quotable: true }),
  'organisation.contact-phone': setting.text({ unset: true, maxLength: 30, change: organisation, audience: 'public', quotable: true }),
  'organisation.address': setting.text({ unset: true, maxLength: 300, change: organisation, audience: 'public', quotable: true }),
  'organisation.legal-name': setting.text({ unset: true, maxLength: 120, change: organisation, audience: 'public', quotable: true }),
  'organisation.charity-number': setting.text({ unset: true, maxLength: 30, change: organisation, audience: 'public', quotable: true }),

  // Brand (C-35, C-36). Saved together through PUT /api/core/branding, which raises the revision.
  'brand.accent': setting.colour({ default: '#2563eb', change: branding, audience: 'public' }),
  'brand.neutral': setting.choice({ default: 'slate', options: ['slate', 'stone', 'zinc', 'neutral'], change: branding, audience: 'public' }),
  'brand.display-font': setting.choice({ default: 'system', options: ['system', 'serif', 'rounded'], change: branding, audience: 'public' }),
  'brand.radius': setting.choice({ default: 'medium', options: ['none', 'small', 'medium', 'large'], change: branding, audience: 'public' }),
  'brand.default-mode': setting.choice({ default: 'auto', options: ['auto', 'light', 'dark'], change: branding, audience: 'public' }),
  'brand.credit-line': setting.boolean({ default: true, change: branding, audience: 'public' }),
  'brand.logo': setting.reference({ record: 'core.file', change: branding, audience: 'public', managed: true }),
  'brand.logo-dark': setting.reference({ record: 'core.file', change: branding, audience: 'public', managed: true }),
  'brand.revision': setting.integer({ default: 0, min: 0, max: 1_000_000_000, change: branding, audience: 'public', managed: true }), // not-policy: a counter's ceiling

  // Files (C-23, C-36).
  'files.image-limit': setting.integer({ default: 10, min: 1, max: 50, unit: 'core.units.megabytes', change: filesConfigure, audience: 'signed-in' }),
  'files.document-limit': setting.integer({ default: 25, min: 1, max: 100, unit: 'core.units.megabytes', change: filesConfigure, audience: 'signed-in' }),
  'files.brand-limit': setting.integer({ default: 1, min: 1, max: 5, unit: 'core.units.megabytes', change: filesConfigure }),
  'files.deleted-retention': setting.duration({ default: '30d', min: '0d', max: '365d', change: filesConfigure }),
  'files.upload-timeout': setting.duration({ default: '1h', min: '5m', max: '24h', change: filesConfigure }),

  // Sending email (C-27, C-28, C-32). verified-domain is written only by the verify route.
  'notifications.sending-domain': setting.text({ unset: true, maxLength: 253, change: sender }),
  'notifications.verified-domain': setting.text({ unset: true, maxLength: 253, change: sender, managed: true }),
  'notifications.email-footer': setting.text({ unset: true, maxLength: 500, change: 'core.template.edit' }),
})

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)) // not-policy: minutes in an hour

export const settingRules: SettingRule[] = [
  { id: 'day-rollover-early', check: s => minutes(s['organisation.day-rollover']) <= minutes('08:00') },
  { id: 'country-code', check: s => /^[A-Z]{2}$/.test(s['organisation.country']) },
  { id: 'contact-email', check: s => s['organisation.contact-email'] === null || z.email().safeParse(s['organisation.contact-email']).success },
  { id: 'sending-domain', check: s => s['notifications.sending-domain'] === null || /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(s['notifications.sending-domain']) },
]

export const records = defineRecords('core', {
  file: record({ table: 'core_files' }),
  sender: record({ table: 'core_sender_identities' }),
})

export const abilities = defineAbilities('core', {
  'organisation.edit': ability({ risk: 'privileged' }),
  'branding.edit': ability({ risk: 'privileged' }),
  'file.configure': ability(),
  'sender.manage': ability({ risk: 'privileged' }),
  'template.edit': ability(),
})

const variableName = z.string().regex(/^[a-z][a-zA-Z0-9]*$/)
const wording = z.object({ subject: z.string().min(1).max(200), body: z.string().min(1).max(5000) }).strict() // not-policy: sane bounds for shipped wording

export const points = {
  /**
   * A message a module sends. Phase 1 sends transactional email to an explicit address; the inbox,
   * preferences and other channels arrive with the full pipeline, without a change to this shape.
   */
  'core.notification-type': point({
    kind: 'data',
    schema: z.object({
      id: z.string().regex(/^[a-z][a-z0-9-]*\.[a-z0-9.-]+$/),
      category: z.enum(['transactional', 'optional']),
      side: z.enum(['audience', 'members']),
      channels: z.array(z.enum(['email'])).min(1),
      lane: z.enum(['prompt', 'bulk']).optional(),
      topic: z.string().optional(),
      variables: z.record(variableName, z.enum(['url', 'text'])),
      wording: z.record(z.string(), wording).refine(w => 'en-GB' in w, 'wording needs en-GB'),
    }).strict(),
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
      accepts: z.array(z.enum(['png', 'jpeg', 'webp', 'svg', 'pdf'])).min(1),
      limit: z.string(),
      access: z.enum(['public', 'signed_in', 'record']),
      textClass: z.enum(['public', 'internal', 'personal']),
      clean: z.boolean(),
    }).strict(),
  }),
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
  /** A component a fork's Markdown page may use, such as ::whats-on. `setting` switches it off. */
  'core.public-component': point({
    kind: 'data',
    schema: z.object({ id: z.string().regex(/^[a-z][a-z0-9-]*$/), setting: z.string().optional() }).strict(),
  }),
}

export const contributes = {
  'core.file-slot': [
    { id: 'core.brand-logo', owner: 'site', ability: 'core.branding.edit', accepts: ['png', 'jpeg', 'webp', 'svg'], limit: 'core.files.brand-limit', access: 'public', textClass: 'public', clean: true },
    { id: 'core.brand-logo-dark', owner: 'site', ability: 'core.branding.edit', accepts: ['png', 'jpeg', 'webp', 'svg'], limit: 'core.files.brand-limit', access: 'public', textClass: 'public', clean: true },
  ],
  'core.health-check': [{ id: 'core.sending-domain', file: 'sending-domain' }],
  'core.public-component': [{ id: 'setting' }],
}

export const announces = {
  'core.branding.changed': event({ version: 1, payload: z.object({ revision: z.number().int() }), internal: true }),
  'core.file.ready': event({ version: 1, payload: z.object({ fileId: z.string(), slot: code() }), internal: true }),
  'core.file.rejected': event({ version: 1, payload: z.object({ fileId: z.string(), reason: code() }), internal: true }),
}

export const listens = {
  'core.setting.changed': 'recompute-on-change',
}

export const jobs = {
  'core.check-file': job({ payload: z.object({ fileId: z.string() }) }),
  'core.recompute-days': job({ payload: z.object({}), lane: 'bulk' }),
}

export const tasks = {
  'core.sweep-files': task({ every: '1h' }),
}
