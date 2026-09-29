import { z } from 'zod'
import { COMMITTEE_YEAR_END_MONTH } from './london'
import { tokensInTree } from './policy-tokens'
import type { PolicyValues } from './policy-tokens'

// The committee as content/committee.yml states it, quoted by pages as tokens (0107). Pure: the
// content schema, the CI check and the page all read from here.

export const COMMITTEE_PREFIX = 'COMMITTEE_'
export const NAME_GAP = '[name goes here]'
export const COMMITTEE_TABLE_TAG = 'committee-table'

const FIELDS = ['NAME', 'EMAIL'] as const
type Field = typeof FIELDS[number]

export const committeeSchema = z.object({
  updatedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  roles: z.array(z.object({
    key: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
    title: z.string().min(1),
    email: z.email().optional(),
    holders: z.array(z.string().min(1)).default([]),
  })),
})

export type Committee = z.infer<typeof committeeSchema>
export type CommitteeRole = Committee['roles'][number]

export const isCommitteeToken = (token: string): boolean => token.startsWith(COMMITTEE_PREFIX)

function parse(token: string): { key: string, field: Field } | null {
  const field = FIELDS.find(name => token.endsWith(`_${name}`))
  if (!isCommitteeToken(token) || !field) return null
  return { key: token.slice(COMMITTEE_PREFIX.length, -(field.length + 1)), field }
}

export function saysHolders(holders: readonly string[]): string {
  if (holders.length === 0) return NAME_GAP
  if (holders.length === 1) return holders[0]!
  return `${holders.slice(0, -1).join(', ')} and ${holders[holders.length - 1]}`
}

// What CI refuses, so a page never quotes an officer the file cannot name (0012, 0107).
export function committeeTokenProblem(token: string, committee: Committee): string | null {
  const parsed = parse(token)
  if (!parsed) return `\`${token}\` names neither a committee member's name nor their address`
  if (!committee.roles.some(role => role.key === parsed.key)) return `content/committee.yml has no role \`${parsed.key}\``
  return null
}

// An address with no value is the empty text resolvePolicyTree drops whole (J-110 criterion 6).
export function committeeValues(tokens: readonly string[], committee: Committee): PolicyValues {
  const values: PolicyValues = {}
  for (const token of tokens) {
    const parsed = parse(token)
    const role = parsed && committee.roles.find(candidate => candidate.key === parsed.key)
    if (!parsed || !role) continue
    values[token] = { text: parsed.field === 'NAME' ? saysHolders(role.holders) : role.email ?? '', enforced: true }
  }
  return values
}

type Node = string | unknown[]

function hasTag(node: Node, tag: string): boolean {
  if (typeof node === 'string') return false
  return node[0] === tag || (node.slice(2) as Node[]).some(child => hasTag(child, tag))
}

export function quotesCommittee(tree: unknown): boolean {
  if (tokensInTree(tree).some(isCommitteeToken)) return true
  const value = (tree as { value?: Node[] } | null)?.value
  return Array.isArray(value) && value.some(node => hasTag(node, COMMITTEE_TABLE_TAG))
}

// The committee year starts the day after 31 July (0009); August is the handover's grace month.
// Both dates are London YYYY-MM-DD, so string order is date order (0014).
export function mayBeOutOfDate(updatedOn: string, today: string): boolean {
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7))
  const startYear = month > COMMITTEE_YEAR_END_MONTH ? year : year - 1
  const pad = (value: number): string => String(value).padStart(2, '0')
  const yearStart = `${startYear}-${pad(COMMITTEE_YEAR_END_MONTH + 1)}-01`
  const graceEnds = `${startYear}-${pad(COMMITTEE_YEAR_END_MONTH + 2)}-01`
  return today >= graceEnds && updatedOn < yearStart
}
