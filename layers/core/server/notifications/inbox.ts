// A person's inbox on one side (C-30; core part 6, "Account, both sides"): the messages for that
// side, newest first, with the unread count the shell's bell shows. Opening one marks it read; all
// can be marked read at once; one can be archived, and brought back. A message past its expiry
// (core.delivery.inbox-retention) is gone from view before the purge removes it. Every read and
// change is by the person's account scope, so a merged-in account's messages are theirs too.
import { sql } from 'drizzle-orm'
import { nowMs, refuse, useDb } from '#kit'
import type { UnitView } from '#kit'
import { inAccountScope } from '#kit/accounts'

export type Side = 'audience' | 'members'

export interface InboxItem {
  id: string
  title: string
  body: string | null
  /** Where the message leads, always inside the application. */
  link: string | null
  read: boolean
  archived: boolean
  createdAt: number
}

export interface InboxPage { items: InboxItem[], unread: number, more: boolean }

const NOT_FOUND = { code: 'core.not-found', reason: 'There is no such message.' }

interface Row { id: string, title: string, body: string | null, link: string | null, read_at: number | null, archived_at: number | null, created_at: number }

const item = (r: Row): InboxItem => ({ id: r.id, title: r.title, body: r.body, link: r.link, read: r.read_at !== null, archived: r.archived_at !== null, createdAt: r.created_at })

/** How many unread, unarchived messages the person has on one side: the bell's number. */
export async function unreadCount(accountId: string, side: Side): Promise<number> {
  const row = await useDb().get<{ n: number }>(sql`SELECT count(*) AS n FROM core_inbox_items
    WHERE ${inAccountScope('account_id', accountId)} AND side = ${side} AND read_at IS NULL AND archived_at IS NULL AND expires_at > ${nowMs()}`)
  return row?.n ?? 0
}

/** One page of messages, newest first: the current ones, or the archived ones. `before` is the last one's id. */
export async function listInbox(accountId: string, side: Side, options: { archived?: boolean, before?: string, size: number }): Promise<InboxPage> {
  const now = nowMs()
  const after = options.before
    ? await useDb().get<{ created_at: number }>(sql`SELECT created_at FROM core_inbox_items WHERE id = ${options.before} AND ${inAccountScope('account_id', accountId)}`)
    : undefined
  const rows = await useDb().all<Row>(sql`SELECT id, title, body, link, read_at, archived_at, created_at FROM core_inbox_items
    WHERE ${inAccountScope('account_id', accountId)} AND side = ${side} AND expires_at > ${now}
      AND archived_at IS ${options.archived ? sql`NOT NULL` : sql`NULL`}
      ${after ? sql`AND (created_at < ${after.created_at} OR (created_at = ${after.created_at} AND id < ${options.before!}))` : sql``}
    ORDER BY created_at DESC, id DESC LIMIT ${options.size + 1}`)
  return { items: rows.slice(0, options.size).map(item), unread: await unreadCount(accountId, side), more: rows.length > options.size }
}

/** Refuses with "not found" unless the message is the person's and has not expired. */
export async function assertOwnItem(accountId: string, id: string): Promise<void> {
  const row = await useDb().get<{ id: string }>(sql`SELECT id FROM core_inbox_items WHERE id = ${id} AND ${inAccountScope('account_id', accountId)} AND expires_at > ${nowMs()}`)
  if (!row) refuse(NOT_FOUND.code, NOT_FOUND.reason, { status: 404 }) // not-policy: HTTP status
}

/** Opening a message marks it read. Opening it again changes nothing. */
export function markRead(unit: UnitView, accountId: string, id: string): void {
  unit.add(sql`UPDATE core_inbox_items SET read_at = coalesce(read_at, ${nowMs()})
    WHERE id = ${id} AND ${inAccountScope('account_id', accountId)} AND expires_at > ${nowMs()}`).expect(1, NOT_FOUND)
}

/** Every unread message on one side, read. */
export function markAllRead(unit: UnitView, accountId: string, side: Side): void {
  unit.add(sql`UPDATE core_inbox_items SET read_at = ${nowMs()}
    WHERE ${inAccountScope('account_id', accountId)} AND side = ${side} AND read_at IS NULL AND archived_at IS NULL`)
}

/** Archive a message, or bring it back (the toast's Undo). Archiving marks it read. */
export function setArchived(unit: UnitView, accountId: string, id: string, archived: boolean): void {
  const at = nowMs()
  unit.add(archived
    ? sql`UPDATE core_inbox_items SET archived_at = ${at}, read_at = coalesce(read_at, ${at}) WHERE id = ${id} AND ${inAccountScope('account_id', accountId)} AND expires_at > ${at}`
    : sql`UPDATE core_inbox_items SET archived_at = NULL WHERE id = ${id} AND ${inAccountScope('account_id', accountId)} AND expires_at > ${at}`).expect(1, NOT_FOUND)
}
