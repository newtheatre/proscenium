// File answers (form builder specification, parts 1 to 3; walkthrough finding F03). A file is
// uploaded while the person answers, into core's file store under the response it belongs to, and
// checked there by core's job like any other upload: its kind is judged from its bytes and images
// lose their metadata. The answer itself is the list of files chosen, `{ id, name, size, type }`;
// when the response is sent the server reads each file's row again, so what is stored is what core
// holds and never what the browser said. Only a file that has passed its check can be sent.
//
// Who may read a file is forms' to say (point core.file-access): whoever may read the response's
// answers, the person who sent it, and a reviewer assigned to it. A file goes with the answer that
// holds it: when the response is anonymised at the end of its retention period or its sender is
// erased, the files of every answer that loses its value are removed at once, bytes and all.
import { all, can, first, newId, nowMs, refuse, useSetting, files as store, type Actor, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import type { Answers, Definition, Entry, FileRef, Question, Value } from '../shared/engine'
import { questionsOf } from '../shared/engine'

/** Core's file slot every file answer is held in. Its owner is the response. */
export const FILE_SLOT = 'forms.answer-file'
export const OWNER = 'forms.response'

/** What core's check can take in: the kinds it judges from the bytes. Anything else is refused there. */
export const ACCEPTS = ['png', 'jpeg', 'webp', 'pdf'] as const
const MEDIA: Record<string, string> = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'application/pdf': '.pdf' }

const MEGABYTE = 1024 * 1024 // not-policy: unit of size

/** The largest file any question takes, in bytes: the theatre's setting for documents. */
export async function fileLimit(): Promise<number> {
  return (await useSetting('core.files.document-limit') as number) * MEGABYTE
}

/** The most files one response may hold, uploaded or chosen, so a form cannot be used to fill storage. */
export async function filesPerResponse(): Promise<number> {
  return await useSetting('forms.limits.files-per-response') as number
}

interface FileRow { id: string, ownerId: string, state: 'pending' | 'ready' | 'rejected' | 'deleted', mediaType: string, byteSize: number, name: string | null, attachedAt: number | null, rejectedReason: string | null, uploadedBy: string | null }
const FILE = 'id, owner_id AS ownerId, state, media_type AS mediaType, byte_size AS byteSize, original_name AS name, attached_at AS attachedAt, rejected_reason AS rejectedReason, uploaded_by AS uploadedBy'

/** Whether a file of this name and media type is one the question accepts, by its own rule (`fileTypes`). Bytes are judged later. */
export function accepts(q: Question, name: string, type: string): boolean {
  const rule = q.validation?.find(r => r.rule === 'fileTypes')
  if (!rule || !Array.isArray(rule.value) || !rule.value.length) return true
  const lower = name.toLowerCase()
  return (rule.value as string[]).some((t) => {
    const want = t.trim().toLowerCase()
    if (want.startsWith('.')) return lower.endsWith(want) || MEDIA[type] === want || (want === '.jpeg' && MEDIA[type] === '.jpg')
    if (want.endsWith('/*')) return type.startsWith(want.slice(0, -1))
    return type === want
  })
}

/** The size limit a question sets for each file, in bytes, or the theatre's when it sets none or a larger one. */
export async function questionLimit(q: Question): Promise<number> {
  const theatre = await fileLimit()
  const rule = q.validation?.find(r => r.rule === 'maxFileSize')
  const own = typeof rule?.value === 'number' ? rule.value : null
  return own !== null && own > 0 ? Math.min(own, theatre) : theatre
}

/**
 * Stores an upload for a question of a response not yet sent (or sent back for changes), and asks
 * core to check it. The file is the response's, attached once the response is sent with it.
 */
export async function uploadAnswerFile(unit: UnitView, input: { responseId: string, question: Question, actor: Actor, name: string, type: string, bytes: Uint8Array }): Promise<{ id: string, name: string, size: number, type: string, state: 'pending' }> {
  const { question: q, bytes } = input
  if (q.type !== 'file') refuse('forms.files.not-a-file-question', 'This question does not take files.', { status: 422 }) // not-policy: HTTP status
  if (bytes.length === 0) refuse('forms.files.empty', 'The file is empty.', { status: 422, fields: { file: 'forms.files.empty' } }) // not-policy: HTTP status
  if (bytes.length > await questionLimit(q)) refuse('forms.files.too-large', 'This file is larger than this question takes.', { status: 413, fields: { file: 'forms.files.too-large' } }) // not-policy: HTTP status
  if (!accepts(q, input.name, input.type)) refuse('forms.files.type', 'This question does not take files of this kind.', { status: 422, fields: { file: 'forms.files.type' } }) // not-policy: HTTP status
  const held = (await first<{ n: number }>("SELECT count(*) AS n FROM core_files WHERE owner_type = ? AND owner_id = ? AND slot = ? AND state IN ('pending', 'ready')", OWNER, input.responseId, FILE_SLOT))!.n
  if (held >= await filesPerResponse()) refuse('forms.files.too-many', 'These answers already hold as many files as one response can.', { status: 422, fields: { file: 'forms.files.too-many' } }) // not-policy: HTTP status

  const id = newId('fil', { random: true })
  const objectKey = `files/${crypto.randomUUID()}`
  await store.put(objectKey, bytes)
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)
  const sha = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('') // not-policy: hexadecimal
  unit.add({
    sql: "INSERT INTO core_files (id, object_key, owner_type, owner_id, slot, original_name, text_class, media_type, byte_size, sha256, access, state, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 'personal', 'application/octet-stream', ?, ?, 'record', 'pending', ?, ?)",
    params: [id, objectKey, OWNER, input.responseId, FILE_SLOT, input.name, bytes.length, sha, input.actor.accountId ?? null, nowMs()],
  })
  unit.enqueue('core.check-file', { fileId: id })
  unit.audit({ action: 'create', record: ['core.file', id], detail: { slot: FILE_SLOT } })
  return { id, name: input.name, size: bytes.length, type: input.type, state: 'pending' }
}

/** Where a file uploaded for a response stands, for the page to show while core checks it. */
export async function uploadState(responseId: string, fileId: string): Promise<{ id: string, state: FileRow['state'], reason: string | null, size: number, type: string } | null> {
  const row = await first<FileRow>(`SELECT ${FILE} FROM core_files WHERE id = ? AND owner_type = ? AND owner_id = ? AND slot = ?`, fileId, OWNER, responseId, FILE_SLOT)
  return row ? { id: row.id, state: row.state, reason: row.rejectedReason, size: row.byteSize, type: row.mediaType } : null
}

const refsOf = (value: Value): FileRef[] => Array.isArray(value) ? (value as unknown[]).filter((v): v is FileRef => !!v && typeof v === 'object' && typeof (v as FileRef).id === 'string') : []

/** Every file answer in a set of answers, with the path the page puts a problem beside. */
function fileAnswers(def: Definition, kept: Answers): { path: string, question: Question, refs: FileRef[], set: (refs: FileRef[]) => void }[] {
  const out: ReturnType<typeof fileAnswers> = []
  for (const { question: q, group } of questionsOf(def)) {
    if (q.type !== 'file') continue
    if (!group) {
      out.push({ path: q.id, question: q, refs: refsOf(kept[q.id] as Value), set: (refs) => { kept[q.id] = refs } })
      continue
    }
    const entries = Array.isArray(kept[group.id]) ? kept[group.id] as Entry[] : []
    entries.forEach((entry, i) => out.push({ path: `${group.id}.${i}.${q.id}`, question: q, refs: refsOf(entry[q.id] as Value), set: (refs) => { entry[q.id] = refs } }))
  }
  return out.filter(f => f.refs.length)
}

/**
 * Puts what core holds in place of each file answer the browser sent: the name given at upload, the
 * real size and the kind judged from the bytes. Run before the engine, so its checks see the truth.
 * Changes `kept` in place, and returns what is wrong with any file, by the path of its answer.
 */
export async function settleFileAnswers(def: Definition, kept: Answers, responseId: string): Promise<Record<string, string>> {
  const found = fileAnswers(def, kept)
  const problems: Record<string, string> = {}
  if (!found.length) return problems
  const ids = [...new Set(found.flatMap(f => f.refs.map(r => r.id)))]
  const rows = new Map((await all<FileRow>(`SELECT ${FILE} FROM core_files WHERE owner_type = ? AND owner_id = ? AND slot = ? AND id IN (SELECT value FROM json_each(?))`, OWNER, responseId, FILE_SLOT, JSON.stringify(ids))).map(r => [r.id, r]))
  for (const f of found) {
    f.set(f.refs.map((ref) => {
      const row = rows.get(ref.id)
      if (!row || row.state === 'deleted') problems[f.path] = 'forms.issues.file-missing'
      else if (row.state === 'rejected') problems[f.path] = 'forms.issues.file-refused'
      else if (row.state === 'pending') problems[f.path] ??= 'forms.issues.file-checking'
      else return { id: row.id, name: row.name ?? ref.name, size: row.byteSize, type: row.mediaType }
      return ref
    }))
  }
  return problems
}

/**
 * Refuses the answers if a file the engine kept (a visible answer) is still being checked, was
 * refused, or is not this response's; otherwise returns the ids of the files to attach.
 */
export function refuseFileProblems(def: Definition, kept: Answers, problems: Record<string, string>): string[] {
  const found = fileAnswers(def, kept)
  const fields = Object.fromEntries(found.filter(f => problems[f.path]).map(f => [f.path, problems[f.path]!]))
  if (Object.keys(fields).length) refuse('forms.response.invalid', 'Some answers need attention.', { status: 422, fields }) // not-policy: HTTP status
  return [...new Set(found.flatMap(f => f.refs.map(r => r.id)))]
}

/**
 * Attaches the files a response was sent with, in the unit that stores it. Files uploaded for it
 * and never sent are removed, bytes and all; files attached to an earlier revision stay, because
 * that revision can still be read.
 */
export function attachFileAnswers(unit: UnitView, responseId: string, ids: string[], at: number): void {
  if (ids.length) {
    unit.add({
      sql: "UPDATE core_files SET attached_at = ?1 WHERE owner_type = ?2 AND owner_id = ?3 AND slot = ?4 AND state = 'ready' AND attached_at IS NULL AND id IN (SELECT value FROM json_each(?5))", // not-policy: numbered parameters
      params: [at, OWNER, responseId, FILE_SLOT, JSON.stringify(ids)],
    })
  }
  unit.add({
    sql: "UPDATE core_files SET state = 'deleted', deleted_at = ?1, purge_after = ?1 WHERE owner_type = ?2 AND owner_id = ?3 AND slot = ?4 AND state IN ('pending', 'ready', 'rejected') AND attached_at IS NULL AND id NOT IN (SELECT value FROM json_each(?5))", // not-policy: numbered parameters
    params: [at, OWNER, responseId, FILE_SLOT, JSON.stringify(ids)],
  })
}

/**
 * The statement that removes the files of the responses `responses` selects whose answers are being
 * emptied: every file not held by a public or internal answer of the same response, which stays.
 * `responses` is SQL selecting response ids and `at` the placeholder of the time, both in the
 * caller's own parameters. Run it before the answers are emptied.
 */
export function discardFileAnswers(responses: string, at: string): string {
  return `UPDATE core_files SET state = 'deleted', deleted_at = ${at}, purge_after = ${at}
    WHERE owner_type = '${OWNER}' AND slot = '${FILE_SLOT}' AND state IN ('pending', 'ready', 'rejected') AND owner_id IN (${responses})
    AND id NOT IN (SELECT kept FROM (SELECT CASE WHEN j.type = 'object' THEN json_extract(j.value, '$.id') END AS kept FROM forms_answers a, json_each(a.value_json) j WHERE a.response_id = core_files.owner_id AND a.data_class IN ('public', 'internal') AND a.value_json IS NOT NULL) WHERE kept IS NOT NULL)`
}

/** Files of unsent responses older than a week (the longest a working copy is kept off the account) whose response never came. */
export async function sweepAbandonedFiles(unit: UnitView, at: number, batch: number): Promise<number> {
  const KEEP = 7 * 86_400_000 // not-policy: the interface specification's limit for a draft kept on a device
  const stale = await all<{ id: string }>(
    `SELECT f.id FROM core_files f WHERE f.owner_type = ? AND f.slot = ? AND f.attached_at IS NULL AND f.state IN ('pending', 'ready', 'rejected') AND f.created_at < ?
     AND NOT EXISTS (SELECT 1 FROM forms_responses r WHERE r.id = f.owner_id AND r.state = 'draft') LIMIT ?`, OWNER, FILE_SLOT, at - KEEP, batch)
  if (!stale.length) return 0
  unit.add({ sql: "UPDATE core_files SET state = 'deleted', deleted_at = ?1, purge_after = ?1 WHERE id IN (SELECT value FROM json_each(?2)) AND attached_at IS NULL", params: [at, JSON.stringify(stale.map(s => s.id))] })
  return stale.length
}

/** Whether this person may read a file answer of this response (point core.file-access). */
export async function mayReadAnswerFile(actor: Actor, responseId: string, fileId: string): Promise<boolean> {
  if (actor.kind !== 'person' || !actor.accountId) return false
  const response = await first<{ formId: string, personId: string | null }>('SELECT form_id AS formId, person_id AS personId FROM forms_responses WHERE id = ?', responseId)
  const file = await first<{ uploadedBy: string | null }>('SELECT uploaded_by AS uploadedBy FROM core_files WHERE id = ?', fileId)
  const mine = (id: string | null) => id ? first(`SELECT 1 AS yes WHERE ?1 IN (${accountScopeSql('?2')})`, id, actor.accountId) : Promise.resolve(null)
  // The person who uploaded it, while they are still answering or after.
  if (await mine(file?.uploadedBy ?? null)) return true
  if (!response) return false
  if (await mine(response.personId)) return true
  const conflict = await first(`SELECT 1 AS yes FROM forms_review_assignments WHERE response_id = ?2 AND status = 'conflicted' AND reviewer_id IN (${accountScopeSql('?1')}) LIMIT 1`, actor.accountId, responseId)
  if (conflict) return false
  // A special-category file is read only by somebody who may open special answers.
  const special = await specialFile(responseId, fileId)
  if (special) return (await can(actor, 'forms.response.read-special', ['forms.form', response.formId])).allowed
  if ((await can(actor, 'forms.response.read', ['forms.form', response.formId])).allowed) return true
  return !!await first(`SELECT 1 AS yes FROM forms_review_assignments WHERE response_id = ?2 AND status <> 'conflicted' AND reviewer_id IN (${accountScopeSql('?1')}) LIMIT 1`, actor.accountId, responseId)
}

/** Whether the file is held by a special-category answer: one whose readable columns name nothing. */
async function specialFile(responseId: string, fileId: string): Promise<boolean> {
  const readable = await first(
    'SELECT 1 AS yes FROM forms_answers a, json_each(a.value_json) j WHERE a.response_id = ? AND a.value_json IS NOT NULL AND CASE WHEN j.type = \'object\' THEN json_extract(j.value, \'$.id\') END = ? LIMIT 1', responseId, fileId)
  if (readable) return false
  return !!await first("SELECT 1 AS yes FROM forms_answers WHERE response_id = ? AND data_class = 'special' LIMIT 1", responseId)
}
