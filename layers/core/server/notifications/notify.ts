// notify(): tell accounts something (C-29). It adds statements to the caller's unit of work, so the
// message is recorded with the change it is about, or not at all. One notification per recipient
// and one delivery per channel, written set-wise (U7): a handful of statements for any number of
// recipients up to core.units.set-rows-limit, which the kit enforces before anything is written.
// Email is sent after the commit by the job core.send-notifications; the inbox item is written here.
import { sql } from 'drizzle-orm'
import { all, first, inAccountScope, isEnabled, nowMs, refuse, sealSpecial, useContext, useDb, useSetting } from '#kit'
import type { RecordRef, UnitView } from '#kit'
import { useRegistry } from '#kit/registry'
import { deliveries, inboxItems, notifications } from '../db/domain'
import { addressesFor } from '../identity/addresses'
import { brandTokens } from '../brand/theme'
import { checkVariables, linkPath, render } from './render'
import { suppressedAddresses } from './suppression'
import { theatreName, type NotificationType } from './send'

export interface NotifyRecipient {
  accountId: string
  /** Variables for this recipient only, over the shared ones. */
  variables?: Record<string, string>
  dedupeKey?: string
}

export interface NotifyOptions {
  /** An account id, or a set of them. */
  to: string | readonly (string | NotifyRecipient)[]
  variables?: Record<string, string>
  /** The same key for the same type and account writes nothing more, however often it is sent. */
  dedupeKey?: string
  /** A sender identity's key, over the one routed for the type's topic. */
  senderKey?: string
  /** The record this is about. */
  subject?: RecordRef
}

export type DeliveryState = 'queued' | 'held' | 'sending' | 'sent' | 'retrying' | 'failed' | 'suppressed' | 'skipped' | 'bounced' | 'complained'

/** A declared type and the module that declares it, whether or not that module is on. */
export function declaredType(typeKey: string): { type: NotificationType, module: string } | undefined {
  for (const entry of useRegistry().modules.values()) {
    const found = (entry.manifest.contributes?.['core.notification-type'] as NotificationType[] | undefined)?.find(t => t.id === typeKey)
    if (found) return { type: found, module: entry.manifest.id }
  }
  return undefined
}

/**
 * A dedupe key, without the account (R-34): the key has to match across a merge, so the account is
 * compared in the statement instead, and the unique index is on the key and the account together.
 */
async function dedupeHash(typeKey: string, key: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${typeKey}\u0000${key}`))
  return `ntf:${[...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')}` // not-policy: hexadecimal
}

function recordOf(subject?: RecordRef): { type: string | null, id: string | null } {
  if (!subject) return { type: null, id: null }
  return Array.isArray(subject) ? { type: subject[0], id: subject[1] ?? null } : { type: (subject as any).type, id: (subject as any).id ?? null }
}

/**
 * Records one notification for each account in `to`, with its deliveries, in the caller's unit.
 * Returns the notification ids in the order of `to`; a recipient already told under the same dedupe
 * key gets the id of that earlier notification and nothing new is written for them.
 */
export async function notify(unit: UnitView, typeKey: string, options: NotifyOptions): Promise<string[]> {
  const declared = declaredType(typeKey) ?? refuse('core.notifications.unknown-type', `No module declares a message called ${typeKey}.`, { status: 500 })
  const { type, module } = declared
  const list = typeof options.to === 'string' ? [options.to] : options.to
  const recipients = list.map(r => (typeof r === 'string' ? { accountId: r } : r)).map(r => ({
    accountId: r.accountId,
    values: checkVariables(type.variables, { ...options.variables, ...r.variables }),
    dedupeKey: r.dedupeKey ?? options.dedupeKey,
  }))
  if (!recipients.length) return []

  if (options.senderKey && !await first('SELECT 1 AS one FROM core_sender_identities WHERE key = ? AND state = \'active\'', options.senderKey))
    refuse('core.notifications.unknown-sender', `There is no active sender called ${options.senderKey}.`, { status: 500 })

  // A repeat under the same dedupe key writes nothing: read first, as U7 asks. Accounts merged into
  // the recipient count as the recipient (R-34): one statement finds, for each recipient, an earlier
  // notification with the key sent to any account in that recipient's scope. The unique index on
  // the key and the account backs this up for the same account.
  const hashes = await Promise.all(recipients.map(r => (r.dedupeKey ? dedupeHash(typeKey, r.dedupeKey) : Promise.resolve(null))))
  const keyed = recipients.flatMap((r, index) => (hashes[index] ? [{ i: index, a: r.accountId, h: hashes[index] }] : []))
  const earlier = new Map<number, string>()
  if (keyed.length) {
    const found = await useDb().all<{ i: number, id: string }>(sql`SELECT json_extract(r.value, '$.i') AS i, n.id
      FROM json_each(${JSON.stringify(keyed)}) r
      JOIN core_notifications n ON n.dedupe_key = json_extract(r.value, '$.h')
        AND ${inAccountScope('n.account_id', sql`json_extract(r.value, '$.a')`)}`)
    for (const row of found) earlier.set(Number(row.i), row.id)
  }
  const fresh: { index: number, accountId: string, values: Record<string, string>, hash: string | null }[] = []
  const inCall = new Set<string>()
  recipients.forEach((r, index) => {
    const hash = hashes[index] ?? null
    if (hash && (earlier.has(index) || inCall.has(`${r.accountId}\u0000${hash}`))) return
    if (hash) inCall.add(`${r.accountId}\u0000${hash}`)
    fresh.push({ index, accountId: r.accountId, values: r.values, hash })
  })

  const moduleOn = await isEnabled(module)
  const accountIds = [...new Set(fresh.map(r => r.accountId))]
  const wantsEmail = type.channels.includes('email')
  const wantsInbox = type.channels.includes('inbox')

  // What the person chose for this topic. A transactional type has no topic, so nothing mutes it.
  const muted = new Set<string>()
  if (type.category !== 'transactional' && type.topic && accountIds.length) {
    const rows = await all<{ account_id: string, channel: string }>(
      'SELECT account_id, channel FROM core_notification_preferences WHERE topic_key = ? AND enabled = 0 AND account_id IN (SELECT value FROM json_each(?))', // exact-account: a preference is moved to the survivor by the merge handler; to become set-wise scope
      type.topic, JSON.stringify(accountIds),
    )
    for (const row of rows) muted.add(`${row.account_id}\u0000${row.channel}`)
  }
  const addresses = wantsEmail && moduleOn ? await addressesFor(accountIds, type.side) : new Map<string, string | null>()
  const suppressed = await suppressedAddresses([...addresses.values()].filter((a): a is string => !!a))
  const locales = new Map<string, string | null>()
  if (accountIds.length) {
    for (const row of await all<{ id: string, locale: string | null }>('SELECT id, locale FROM core_accounts WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify(accountIds)))
      locales.set(row.id, row.locale)
  }
  const fallbackLocale = (await useSetting('core.locale.language') as string | null) ?? 'en-GB'
  const localeOf = (accountId: string) => {
    const own = locales.get(accountId)
    if (own && type.wording[own]) return own
    return type.wording[fallbackLocale] ? fallbackLocale : 'en-GB'
  }

  const record = recordOf(options.subject)
  const actor = useContext().actor
  const at = nowMs()
  // Sealed variables go in their own encrypted column, never in payload.
  const sealedNames = Object.keys(type.variables).filter(name => type.variables[name] === 'sealed')
  const split = await Promise.all(fresh.map(async (r) => {
    const open = Object.fromEntries(Object.entries(r.values).filter(([k]) => !sealedNames.includes(k)))
    const hidden = Object.fromEntries(Object.entries(r.values).filter(([k]) => sealedNames.includes(k)))
    return { open, sealed: sealedNames.length ? await sealSpecial(JSON.stringify(hidden)) : null }
  }))
  const ids = unit.insertSet(notifications, fresh.map((r, i) => ({
    typeKey,
    side: type.side,
    accountId: r.accountId,
    locale: localeOf(r.accountId),
    subjectType: record.type,
    subjectId: record.id,
    dedupeKey: r.hash,
    payload: split[i]!.open,
    sealedVariables: split[i]!.sealed,
    actorId: actor.accountId ?? null,
  })))

  const stateFor = (accountId: string, channel: 'email' | 'inbox'): { state: DeliveryState, reason: string | null } => {
    if (!moduleOn) return { state: 'skipped', reason: 'module_off' }
    if (muted.has(`${accountId}\u0000${channel}`)) return { state: 'suppressed', reason: 'preference' }
    if (channel === 'inbox') return { state: 'sent', reason: null }
    const address = addresses.get(accountId)
    // No committed address yet, perhaps because the account is made in this same unit (an
    // invitation): queue it, and the send job, which reads the address again, decides.
    if (!address) return { state: 'queued', reason: null }
    if (suppressed.has(address.toLowerCase())) return { state: 'skipped', reason: 'suppressed_address' }
    return { state: 'queued', reason: null }
  }

  const queued: string[] = []
  if (wantsEmail && fresh.length) {
    const rows = fresh.map((r, i) => ({ notificationId: ids[i]!, side: type.side, channel: 'email', ...stateFor(r.accountId, 'email'), senderKey: options.senderKey ?? null }))
    const made = unit.insertSet(deliveries, rows)
    rows.forEach((row, i) => { if (row.state === 'queued') queued.push(made[i]!) })
  }

  if (wantsInbox && fresh.length) {
    const rows = fresh.map((r, i) => {
      const { state, reason } = stateFor(r.accountId, 'inbox')
      return { notificationId: ids[i]!, side: type.side, channel: 'inbox', state, reason, sentAt: state === 'sent' ? at : null }
    })
    const made = unit.insertSet(deliveries, rows)
    const delivered = fresh.map((r, i) => ({ r, i })).filter(({ i }) => rows[i]!.state === 'sent')
    if (delivered.length) {
      const brand = await brandTokens()
      const theatre = await theatreName('The theatre')
      const keepFor = await useSetting('core.delivery.inbox-retention') as number
      unit.insertSet(inboxItems, delivered.map(({ r, i }) => {
        const message = render(type.wording[localeOf(r.accountId)]!, { values: r.values, kinds: type.variables, accent: brand.light.link, theatre })
        return {
          accountId: r.accountId,
          deliveryId: made[i]!,
          side: type.side,
          title: message.subject.slice(0, 120), // not-policy: the column's bound
          body: message.text.trim().slice(0, 500) || null, // not-policy: the column's bound
          link: linkPath(type.link, r.values),
          expiresAt: at + keepFor * 1000, // not-policy: seconds to milliseconds
        }
      }))
    }
  }

  if (queued.length) unit.enqueue('core.send-notifications', { deliveryIds: queued }, { lane: type.lane ?? 'prompt' })

  // Each recipient's notification: the one made now, or the one its dedupe key already names.
  // A repeat within this call takes the id made for the same account and key.
  const byKey = new Map<string, string>()
  fresh.forEach((r, i) => { if (r.hash) byKey.set(`${r.accountId}\u0000${r.hash}`, ids[i]!) })
  const byIndex = new Map(fresh.map((r, i) => [r.index, ids[i]!]))
  return recipients.map((r, index) => byIndex.get(index) ?? earlier.get(index) ?? byKey.get(`${r.accountId}\u0000${hashes[index]!}`)!)
}
