// Requirements: "does this person meet this condition at this time" (Formats tab, Requirements).
// A module that can judge a condition contributes a source to core.requirement under its own id;
// a host stores a reference `<source>:<id>` (or `fact:<name>`, which core answers) and asks the kit.
// The kit gives verdicts only: the host decides what not met means and owns any override.
import { useRegistry } from './registry'
import { usePoint } from './points'
import { isEnabled } from './modules-store'
import { can, requireAbility, fact as holdsFactFor } from './access'
import { useContext } from './context'
import { createUnit } from './unit'
import { countAgainstRate } from './ratelimit'
import { nowMs } from './clock'
import { log } from './log'
import type { RecordRef } from './unit'

/** What a source says about one pair of account and reference. */
export interface SourceAnswer {
  /** The account asked about, or null for a check on a presented value alone. */
  account: string | null
  ref: string
  verdict: 'met' | 'not-met' | 'unavailable'
  /** When a met verdict lapses, in UTC milliseconds, if known. */
  until?: number
  /** A translated sentence for the person: why not, or what to do. */
  reason?: string
  /** One short translated sentence for staff, for any verdict. No name, no typed value. */
  summary?: string
  /** An id the host stores with what it sold and may present again later. Never a secret. */
  evidence?: string
  help?: string
  /** On a met verdict: how many of the thing the host may grant on it, nought or more. */
  quantity?: number
  /**
   * On a met verdict: the account the source knows a presented value belongs to (R-34). The kit
   * hands it to the host on the server only; it never reaches the browser, a summary, an event or
   * a job.
   */
  holderAccountId?: string
}

/** A value the person presents with no account: what was typed, or what an earlier answer returned. */
export type Presented = { ref: string, value: string } | { ref: string, evidence: string }

export interface RequirementOption { reference: string, label: string, description?: string }
export interface RequirementDescription {
  label: string
  /** Tells the host to show a field for a value the person presents, and how to label and check it. */
  presentable?: { label: string, shape: string }
}

/** The contract of a core.requirement contribution. The contribution's id is the source id. */
export interface RequirementSource {
  options: (query: string) => Promise<RequirementOption[]>
  describe: (refs: string[]) => Promise<Record<string, RequirementDescription>>
  check: (accountIds: (string | null)[], refs: string[], at: number, record?: RecordRef, presented?: Presented[]) => Promise<SourceAnswer[]>
  /** A display name for a piece of evidence, for staff only, guarded by holderAbility. */
  holder?: (evidence: string) => Promise<string | null>
  /** The ability, declared audit: 'read', that guards holder(). Required when holder is given. */
  holderAbility?: string
  /**
   * An ability, declared audit: 'read', needed to ask about an account other than the actor's own.
   * Without it the source answers for any account, as a rota needs.
   */
  checkAbility?: string
}

export const defineRequirementSource = (source: RequirementSource): RequirementSource => source

/** One answer the kit gives a host. */
export interface Answer {
  account: string | null
  ref: string
  verdict: 'met' | 'not-met'
  /** True when the source was off, absent or failed, and the verdict is the host's whenUnavailable. */
  unavailable: boolean
  until?: number
  reason?: string
  summary?: string
  evidence?: string
  help?: string
  quantity?: number
  /**
   * On a met verdict, the account a presented value belongs to, if the source knows. Server only:
   * it is not enumerable, so turning the answer into JSON (a route returning it) leaves it out.
   */
  readonly holderAccountId?: string
}

export interface CheckRequest {
  accounts: readonly (string | null)[]
  refs: readonly string[]
  /** The instant asked about: a rota asks about the night of the shift, not today. Defaults to now. */
  at?: number
  record?: RecordRef
  presented?: readonly Presented[]
  /**
   * What an unavailable source counts as. 'met' where the requirement restricts who may do
   * something, so a missing module never locks people out; 'not-met' where it grants a benefit.
   */
  whenUnavailable: 'met' | 'not-met'
}

const FACT = 'fact'
const NOT_ALLOWED = 'You cannot check this for someone else.'
const SLOW_DOWN = 'Too many tries. Wait a few minutes, then try again.'
const UNKNOWN_REF = 'This requirement is not recognised.'

export function parseReference(ref: string): { source: string, id: string } | undefined {
  const at = ref.indexOf(':')
  if (at < 1 || at === ref.length - 1) return undefined
  return { source: ref.slice(0, at), id: ref.slice(at + 1) }
}

async function sources(): Promise<Map<string, { module: string, source: RequirementSource }>> {
  const out = new Map<string, { module: string, source: RequirementSource }>()
  for (const c of await usePoint<RequirementSource>('core.requirement')) out.set(c.id, { module: c.module, source: c.value })
  return out
}

/** The picker: what a source offers an administrator, matching the query. */
async function options(source: string, query = ''): Promise<RequirementOption[]> {
  if (source === FACT) {
    const q = query.toLowerCase()
    return [...useRegistry().facts.keys()].filter(name => name.includes(q)).map(name => ({ reference: `${FACT}:${name}`, label: factLabel(name) }))
  }
  const found = (await sources()).get(source)
  return found ? found.source.options(query) : []
}

function factLabel(name: string): string {
  const [module, ...rest] = name.split('.')
  return `${module}.facts.${rest.join('.')}.label`
}

/** Labels for stored references. A reference whose source is off or absent is left out. */
async function describe(refs: readonly string[]): Promise<Record<string, RequirementDescription>> {
  const out: Record<string, RequirementDescription> = {}
  const bySource = groupBySource(refs)
  const all = await sources()
  for (const [source, list] of bySource) {
    if (source === FACT) {
      for (const ref of list) if (useRegistry().facts.has(parseReference(ref)!.id)) out[ref] = { label: factLabel(parseReference(ref)!.id) }
      continue
    }
    const found = all.get(source)
    if (found) Object.assign(out, await found.source.describe(list))
  }
  return out
}

function groupBySource(refs: readonly string[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const ref of new Set(refs)) {
    const parsed = parseReference(ref)
    if (!parsed) continue
    const list = out.get(parsed.source) ?? []
    list.push(ref)
    out.set(parsed.source, list)
  }
  return out
}

/** Whether the actor may ask a source about someone else's account; records the read when so. */
async function mayAskAbout(ability: string, account: string): Promise<boolean> {
  const { actor } = useContext()
  if (actor.accountId === account) return true
  // A job or a task has no person behind it, so it never holds the ability (Formats tab).
  if (!actor.accountId) return false
  const on = useRegistry().abilities.get(ability)?.decl.on
  const decision = await can(actor, ability as any, on === 'core.account' ? ['core.account', account] : undefined)
  if (!decision.allowed) return false
  const unit = createUnit()
  unit.audit({ action: 'read', ability, record: ['core.account', account], detail: { purpose: 'requirement-check' } })
  await unit.commit()
  return true
}

/** The rate-limit keys for a check carrying a typed value: the session, and the network address. */
function presentedKeys(): string[] {
  const context = useContext()
  const keys = [`address:${context.address ?? 'unknown'}`]
  if (context.actor.sessionId) keys.push(`session:${context.actor.sessionId}`)
  return keys
}

function clean(answer: SourceAnswer): Omit<SourceAnswer, 'verdict'> {
  const { quantity, ...rest } = answer
  const out: Omit<SourceAnswer, 'verdict'> = { ...rest }
  if (answer.verdict === 'met' && quantity !== undefined) {
    if (Number.isInteger(quantity) && quantity >= 0) out.quantity = quantity
    else log.warn('core.requirements.bad-quantity', { ref: answer.ref })
  }
  delete (out as any).verdict
  return out
}

/**
 * Judges several accounts against several references at one instant. Every pair gets an answer.
 * Typed values never reach the audit log, an event or a job, and never come back in an answer.
 */
async function check(request: CheckRequest): Promise<Answer[]> {
  if (request.whenUnavailable !== 'met' && request.whenUnavailable !== 'not-met') throw new Error('requirements.check needs whenUnavailable: \'met\' or \'not-met\'')
  const at = request.at ?? nowMs()
  const accounts = [...new Set(request.accounts)]
  const presented = [...(request.presented ?? [])]
  const answers = new Map<string, Answer>()
  const key = (account: string | null, ref: string) => `${account ?? ''}\u0000${ref}`
  const set = (account: string | null, ref: string, answer: Omit<Answer, 'account' | 'ref'>) => {
    const { holderAccountId, ...rest } = answer as Omit<Answer, 'account' | 'ref'> & { holderAccountId?: unknown }
    const out: Answer = { account, ref, ...rest }
    if (rest.verdict === 'met' && !rest.unavailable && typeof holderAccountId === 'string' && holderAccountId)
      Object.defineProperty(out, 'holderAccountId', { value: holderAccountId, enumerable: false })
    answers.set(key(account, ref), out)
  }
  const unavailable = (account: string | null, ref: string) => set(account, ref, { verdict: request.whenUnavailable, unavailable: true })

  // Guessing is limited by the kit: a check carrying a typed value counts against presented-value.
  const typed = new Set(presented.filter(p => 'value' in p).map(p => p.ref))
  if (typed.size) {
    let within = true
    for (const k of presentedKeys()) if (!(await countAgainstRate('presented-value', k)).allowed) within = false
    if (!within) {
      for (const ref of typed) for (const account of accounts) set(account, ref, { verdict: 'not-met', unavailable: false, reason: SLOW_DOWN })
    }
  }

  const all = await sources()
  for (const [source, refs] of groupBySource(request.refs)) {
    if (source === FACT) {
      for (const ref of refs) {
        const name = parseReference(ref)!.id
        const declared = useRegistry().facts.get(name)
        for (const account of accounts) {
          if (answers.has(key(account, ref))) continue
          if (!declared) {
            set(account, ref, { verdict: 'not-met', unavailable: false, reason: UNKNOWN_REF })
            continue
          }
          if (!(await isEnabled(declared.module))) {
            unavailable(account, ref)
            continue
          }
          const holds = account !== null && await holdsFactFor(name, { kind: 'person', accountId: account }, request.record as any)
          set(account, ref, { verdict: holds ? 'met' : 'not-met', unavailable: false })
        }
      }
      continue
    }

    const found = all.get(source)
    if (!found || !(await isEnabled(found.module))) {
      for (const ref of refs) for (const account of accounts) if (!answers.has(key(account, ref))) unavailable(account, ref)
      continue
    }

    // Asking about somebody else needs the source's checkAbility; a refused pair never reaches it.
    const askable: (string | null)[] = []
    for (const account of accounts) {
      if (account === null || !found.source.checkAbility || await mayAskAbout(found.source.checkAbility, account)) askable.push(account)
      else for (const ref of refs) if (!answers.has(key(account, ref))) set(account, ref, { verdict: 'not-met', unavailable: false, reason: NOT_ALLOWED })
    }
    const pending = refs.filter(ref => askable.some(account => !answers.has(key(account, ref))))
    if (!askable.length || !pending.length) continue
    const offered = presented.filter(p => pending.includes(p.ref) && !(('value' in p) && answers.has(key(null, p.ref))))

    let given: SourceAnswer[]
    try {
      given = await found.source.check(askable, pending, at, request.record, offered.length ? offered : undefined)
    }
    catch (error) {
      log.error('core.requirements.source-failed', { source, error: String((error as Error)?.message ?? error) })
      given = []
    }
    for (const answer of given) {
      if (!pending.includes(answer.ref) || !askable.includes(answer.account) || answers.has(key(answer.account, answer.ref))) continue
      if (answer.verdict === 'unavailable') {
        unavailable(answer.account, answer.ref)
        continue
      }
      set(answer.account, answer.ref, { ...clean(answer), verdict: answer.verdict === 'met' ? 'met' : 'not-met', unavailable: false })
    }
    // A pair the source left unanswered counts as unavailable.
    for (const ref of pending) for (const account of askable) if (!answers.has(key(account, ref))) unavailable(account, ref)
  }

  // A reference the kit cannot read answers not met.
  for (const ref of request.refs) for (const account of accounts) if (!answers.has(key(account, ref))) set(account, ref, { verdict: 'not-met', unavailable: false, reason: UNKNOWN_REF })
  return accounts.flatMap(account => [...new Set(request.refs)].map(ref => answers.get(key(account, ref))!))
}

/**
 * The name behind a piece of evidence, for staff at the door. Checks the source's holder ability
 * for the person asking and records the read. Live only; never in an answer, an event or a job.
 */
async function holder(ref: string, evidence: string): Promise<string | null> {
  const parsed = parseReference(ref)
  if (!parsed || parsed.source === FACT) return null
  const found = (await sources()).get(parsed.source)
  if (!found?.source.holder || !found.source.holderAbility || !(await isEnabled(found.module))) return null
  const { actor } = useContext()
  if (!actor.accountId) return null
  await requireAbility(actor, found.source.holderAbility as any)
  const unit = createUnit()
  unit.audit({ action: 'read', ability: found.source.holderAbility, detail: { purpose: 'requirement-holder', source: parsed.source } })
  await unit.commit()
  return found.source.holder(evidence)
}

export const requirements = { options, describe, check, holder }
