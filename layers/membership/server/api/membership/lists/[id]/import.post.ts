// Loads a file into a list (MEM-20, MEM-57): up to three columns, the address or reference, the end
// date and the name. Each value is hashed as it arrives and the file itself is never stored (V10).
// Importing again keeps the id of every entry whose value is unchanged, so evidence a host kept
// still points at it (V11); an entry missing from the new file stops matching and loses its name,
// unless staff added it by hand: that one stays until a file holds it too, which makes it the file's.
// With dryRun nothing is written: the answer says how many rows would load and which would not.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, newId, nowMs, refuse, today } from '#kit'
import { addDays } from '../../../../dates'
import { hashValue, parseFile, requireList, requireListKey } from '../../../../lists'

// One import is one unit: chunks of rows set-wise, within D1's limit on a statement's parameter.
const CHUNK = 500 // not-policy: rows per statement, within the kit's set size
const MOST_ROWS = 10_000 // not-policy: what one unit of chunks can carry; a larger file is split by hand

export default defineRoute({
  ability: 'membership.verification-list.manage',
  record: event => ['membership.verification-list', getRouterParam(event, 'id')],
  rateLimit: 'export',
  input: z.object({
    file: z.string().max(2_000_000), // not-policy: the request body D1 can carry
    dryRun: z.boolean().default(false),
  }),
}, async (_event, { input, actor, record, unit }) => {
  const list = await requireList(record!.id)
  const { rows, refused } = parseFile(list.keyKind, list.referenceShape, input.file)
  if (rows.length > MOST_ROWS) refuse('membership.list.too-many', `A file may hold at most ${MOST_ROWS} rows.`, { status: 422, remedy: 'Split the file and load each part into its own list.' })
  if (!rows.length) refuse('membership.list.empty', 'No row of the file could be read.', { status: 422 })
  // The same guards as loading, so a trial never says a file is fine that loading would refuse: the list key, and the theatre's time zone (which dates the ended entries).
  await requireListKey()
  const day = await today()
  if (input.dryRun) return { loaded: 0, wouldLoad: rows.length, refused }

  const at = nowMs()
  const hashed = await Promise.all(rows.map(async r => ({ id: newId('mve'), h: await hashValue(list.keyKind, r.value), e: r.endsOn, n: r.name })))
  for (let i = 0; i < hashed.length; i += CHUNK) {
    unit.add({
      sql: 'INSERT INTO membership_verification_entries (id, list_id, key_hash, ends_on, holder_name, created_at) SELECT json_extract(j.value, \'$.id\'), ?1, json_extract(j.value, \'$.h\'), json_extract(j.value, \'$.e\'), json_extract(j.value, \'$.n\'), ?2 FROM json_each(?3) j WHERE true ON CONFLICT (list_id, key_hash) DO UPDATE SET ends_on = excluded.ends_on, holder_name = excluded.holder_name, by_hand = 0',
      params: [list.id, at, JSON.stringify(hashed.slice(i, i + CHUNK))],
    })
  }
  // An entry not in the new file: deleted, or, where a membership was verified by it, kept as that
  // record but ended yesterday and without its name.
  const kept = JSON.stringify(hashed.map(r => r.h))
  const unused = 'id NOT IN (SELECT entry_id FROM membership_verifications WHERE entry_id IS NOT NULL)'
  unit.add({ sql: `DELETE FROM membership_verification_entries WHERE list_id = ?1 AND key_hash NOT IN (SELECT value FROM json_each(?2)) AND by_hand = 0 AND ${unused}`, params: [list.id, kept] })
  unit.add({ sql: 'UPDATE membership_verification_entries SET ends_on = ?3, holder_name = NULL WHERE list_id = ?1 AND by_hand = 0 AND key_hash NOT IN (SELECT value FROM json_each(?2))', params: [list.id, kept, addDays(day, -1)] })
  unit.add({ sql: 'UPDATE membership_verification_lists SET entry_count = (SELECT count(*) FROM membership_verification_entries WHERE list_id = ?1 AND (by_hand = 1 OR key_hash IN (SELECT value FROM json_each(?2)))), uploaded_at = ?3 WHERE id = ?1', params: [list.id, kept, at] }).expect(1)
  unit.add({ sql: 'UPDATE membership_verification_lists SET uploaded_by = ? WHERE id = ?', params: [actor.accountId, list.id] }) // exact-account: records who uploaded, reads nothing
  unit.audit({ action: 'update', record: ['membership.verification-list', list.id], detail: { loaded: rows.length, refused: refused.length } })
  return { loaded: rows.length, refused }
})
