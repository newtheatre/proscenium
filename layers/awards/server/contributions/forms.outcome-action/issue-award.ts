// Awards' action on forms.outcome-action: issuing the award a nomination was for, once the
// committee has approved it. The form is attached to an award type in the slot awards.nomination;
// its designer puts this on the approving move and says which question names the nominee (a person
// chosen from the people source, so the answer is an account) and which give the citation and what
// it is for. Forms runs it once, in a job, and commits what it writes with the mark that it ran.
//
// What can never work says so at once: no nominee, an award the person already holds, or an approver
// who is the nominee end the run as not done, with the reason in plain words for whoever is looking
// at the nomination. Only what somebody can put right (an archived award) leaves it waiting.
//
// The decision is the response's own: the day it was decided and the reason given. Nobody issues
// their own award, here as anywhere. Awards imports nothing from forms: the shapes below are the
// point's contract.
import { first, localDate, refuse, siteUrl, useSetting, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { notify } from '#modules/core'
import { writeAward } from '../../awards'
import { getType } from '../../types'

interface Answer { value: unknown, text: string }
interface Call {
  runId: string
  input: Record<string, Answer | undefined>
  response: { id: string, reference: string, subjectType: string | null, subjectId: string | null, decidedAt: number | null, decisionReason: string | null }
  actorId: string | null
  at: number
}

type Reading = Omit<Call, 'runId'>
const LISTED = { public: 'On the public roll', members: 'Members only', hidden: 'Not listed' } as const

/**
 * Who a nomination would give which award to, or why it never could. An archived award is not a
 * reason here: restoring it puts that right, so the run waits and the preview warns.
 */
async function reading(call: Reading): Promise<{ skipped: string } | { type: NonNullable<Awaited<ReturnType<typeof getType>>>, account: { id: string, name: string | null }, name: string }> {
  const type = call.response.subjectType === 'awards.type' ? await getType(call.response.subjectId ?? undefined) : null
  if (!type) return { skipped: 'No award was issued: the award this nomination was for no longer exists.' }
  const picked = call.input.nominee?.value
  const accountId = Array.isArray(picked) ? picked[0] : picked
  const account = typeof accountId === 'string' ? await first<{ id: string, name: string | null }>('SELECT id, name FROM core_accounts WHERE id = ? AND anonymised_at IS NULL', accountId) : null
  if (!account) return { skipped: 'No award was issued: the nomination does not name a person with an account. Issue it by hand from Awards instead.' }
  if (call.actorId && await first(`SELECT 1 WHERE ?1 IN (${accountScopeSql('?2')})`, account.id, call.actorId))
    return { skipped: 'No award was issued: nobody can approve an award for their own account. Somebody else can issue it from Awards.' }
  const name = account.name ?? call.input.nominee?.text.trim()
  if (!name) return { skipped: 'No award was issued: this person has no name on their account. Issue it by hand from Awards instead.' }
  if (type.onePerPerson && await first(`SELECT 1 FROM awards_awards WHERE type_id = ?1 AND state = 'current' AND account_id IN (${accountScopeSql('?2')})`, type.id, account.id))
    return { skipped: `No award was issued: ${name} already holds ${type.name}.` }
  return { type, account, name }
}

const words = (answer: Answer | undefined, most: number) => answer?.text.trim().slice(0, most) || null

export default {
  key: 'awards.issue-award',
  label: 'awards.forms.issue-award.label',
  slot: 'awards.nomination',
  inputs: [
    { key: 'nominee', label: 'awards.forms.issue-award.nominee', required: true, types: ['record'] },
    { key: 'awardedFor', label: 'awards.forms.issue-award.awarded-for', types: ['text.short'] },
    { key: 'citation', label: 'awards.forms.issue-award.citation', types: ['text.short', 'text.long'] },
  ],

  /** What approving would issue, for whoever is about to approve: the wording goes on the award as it is written. */
  async preview(call: Reading) {
    const found = await reading(call)
    if ('skipped' in found) return { lines: [], blocked: found.skipped.replace(/^No award was issued: /, 'No award will be issued: ') }
    const { type, name } = found
    const lines = [
      { label: 'awards.forms.issue-award.preview.award', value: type.name },
      { label: 'awards.forms.issue-award.preview.to', value: name },
    ]
    const awardedFor = words(call.input.awardedFor, 200) // not-policy: the bound on the line
    const citation = words(call.input.citation, 2000) // not-policy: the bound on a citation
    if (awardedFor) lines.push({ label: 'awards.forms.issue-award.awarded-for', value: awardedFor })
    if (citation) lines.push({ label: 'awards.forms.issue-award.citation', value: citation })
    lines.push({ label: 'awards.forms.issue-award.preview.listed', value: LISTED[type.defaultVisibility] })
    const warnings: string[] = []
    if (type.state !== 'active') warnings.push('awards.forms.issue-award.preview.archived')
    if (type.defaultVisibility !== 'hidden' && (awardedFor || citation)) warnings.push('awards.forms.issue-award.preview.wording')
    return { lines, warnings }
  },

  async run(unit: UnitView, call: Call): Promise<{ skipped: string } | { record: [string, string] }> {
    const found = await reading(call)
    if ('skipped' in found) return found
    const { type, account, name } = found
    if (type.state !== 'active') refuse('awards.type.archived', `${type.name} is archived, so it cannot be given.`, { status: 409, remedy: 'Restore the award, then run this again.' })
    const awardId = writeAward(unit, {
      type,
      accountId: account.id,
      recipientName: name.slice(0, 120), // not-policy: the bound on a name
      awardedOn: await localDate(call.at),
      awardedFor: words(call.input.awardedFor, 200), // not-policy: the bound on the line
      citation: words(call.input.citation, 2000), // not-policy: the bound on a citation
      decidedOn: await localDate(call.response.decidedAt ?? call.at),
      decisionNote: (call.response.decisionReason ?? `Nomination ${call.response.reference}`).slice(0, 500), // not-policy: the bound on the note
      source: 'nomination',
      responseId: call.response.id,
      issuedBy: call.actorId,
    })
    if (await useSetting('awards.issuing.tell-recipient'))
      await notify(unit, 'awards.awarded', { to: account.id, variables: { award: type.name, link: await siteUrl('/account/awards') }, subject: ['awards.award', awardId], dedupeKey: `awarded:${awardId}` })
    unit.audit({ action: 'create', record: ['awards.award', awardId], detail: { source: 'nomination', responseId: call.response.id, runId: call.runId } })
    return { record: ['awards.award', awardId] }
  },
}
