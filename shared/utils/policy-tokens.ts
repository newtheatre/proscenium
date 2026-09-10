// A policy page quotes the setting the write path enforces, so the published rule and the real
// rule are one document (0012). Pure: the checker, the endpoint and the page all read from here.

// Global, so a page may carry several. Consumers reset `lastIndex` by rebuilding it per use.
const TOKEN_SOURCE = String.raw`\{\{\s*([A-Z0-9_]+)\s*\}\}`

export const policyTokenPattern = (): RegExp => new RegExp(TOKEN_SOURCE, 'g')

export interface PolicyValue {
  // What the token renders as, already formatted for what its key measures.
  text: string
  // False when the committee has stated the rule and no code reads the key (criterion 5).
  enforced: boolean
}

export type PolicyValues = Record<string, PolicyValue>

// A minimark node is a string or `[tag, props, ...children]`; a tree is `{ type, value }`.
type Node = string | unknown[]
interface Tree { type: string, value: Node[] }

export function tokensInText(text: string): string[] {
  return [...text.matchAll(policyTokenPattern())].map(match => match[1]!)
}

function isTree(value: unknown): value is Tree {
  return typeof value === 'object' && value !== null && Array.isArray((value as Tree).value)
}

// The markdown parser reads `{{KEY}}` as MDC interpolation and leaves a binding node, which
// renders as blank unless something resolves it: the failure criterion 4 exists to forbid.
const KEY_SHAPED = /^[A-Z0-9_]+$/

function bindingKey(node: Node): string | null {
  if (typeof node === 'string' || node[0] !== 'binding') return null
  const value = (node[1] as { value?: unknown } | undefined)?.value
  return typeof value === 'string' && KEY_SHAPED.test(value) ? value : null
}

export function tokensInTree(tree: unknown): string[] {
  if (!isTree(tree)) return []
  const found = new Set<string>()

  const walk = (node: Node): void => {
    if (typeof node === 'string') {
      for (const token of tokensInText(node)) found.add(token)
      return
    }
    const bound = bindingKey(node)
    if (bound) {
      found.add(bound)
      return
    }
    for (const child of node.slice(2) as Node[]) walk(child)
  }

  for (const node of tree.value) walk(node)
  return [...found]
}

// The unit a key measures in, read from the key's own name so a label can never disagree with
// what the key is called. The last one named wins: a window in minutes reads in minutes.
const UNITS = ['MINUTES', 'HOURS', 'DAYS', 'WEEKS', 'MONTHS', 'YEARS'] as const

function unitOf(key: string): string | null {
  const parts = key.split('_')
  for (let at = parts.length - 1; at >= 0; at--) {
    const part = parts[at]!
    if ((UNITS as readonly string[]).includes(part)) return part.toLowerCase()
  }
  return null
}

function saysList(values: unknown[]): string {
  const words = values.map(value => String(value).toLowerCase().replaceAll('_', ' '))
  if (words.length <= 1) return words.join('')
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

export function formatPolicyValue(key: string, value: unknown): string {
  if (Array.isArray(value)) return saysList(value)
  if (typeof value === 'boolean') return value ? 'yes' : 'no'

  if (typeof value === 'number') {
    if (key.endsWith('_PENCE')) return `£${(value / 100).toFixed(2)}`
    if (key.endsWith('_PERCENT')) return `${value}%`

    const unit = unitOf(key)
    if (unit) return `${value} ${value === 1 ? unit.slice(0, -1) : unit}`
  }

  return String(value)
}

export interface PolicyKeyState {
  // The configuration schema has this key: the CI check refuses a page where it does not.
  known: boolean
  // Holds personal data, so a page a visitor reads may never quote it (0011, 0024).
  sensitive: boolean
  // Has a value, from an override or a shipped default. An unset key has no rule to quote.
  set: boolean
  enforced: boolean
  value?: unknown
}

// Null means the token cannot be resolved, which the page renders as a visible error rather than
// as blank or stale text (criterion 4).
export function policyValueFor(key: string, state: PolicyKeyState): PolicyValue | null {
  if (!state.known || state.sensitive || !state.set) return null
  return { text: formatPolicyValue(key, state.value), enforced: state.enforced }
}

// What CI refuses in `content/`, so the build and the renderer agree on what a page may quote
// (criterion 3). A sensitive key is refused outright: a public page may never name people.
export function policyTokenProblem(key: string, state: { known: boolean, sensitive: boolean }): string | null {
  if (!state.known) return `unknown configuration key \`${key}\``
  if (state.sensitive) return `\`${key}\` holds personal data and may not be quoted on a public page`
  return null
}

const VALUE_CLASS = 'font-semibold text-highlighted'
const UNENFORCED_CLASS = 'font-semibold text-warning'
const ERROR_CLASS = 'font-semibold text-error'

function span(node: { test: string, key: string, css: string, text: string, title?: string }): unknown[] {
  return ['span', {
    'class': node.css,
    'data-test': node.test,
    'data-key': node.key,
    ...(node.title ? { title: node.title } : {}),
  }, node.text]
}

function nodesFor(key: string, values: PolicyValues): unknown[] {
  const value = values[key]
  if (!value) {
    return span({
      test: 'policy-error',
      key,
      css: ERROR_CLASS,
      text: `[unknown setting: ${key}]`,
      title: 'This page names a setting the system cannot resolve, so no number is shown rather than a wrong one',
    })
  }
  if (!value.enforced) {
    return span({
      test: 'policy-unenforced',
      key,
      css: UNENFORCED_CLASS,
      text: `${value.text} (not enforced yet)`,
      title: 'The committee has stated this rule; the system does not enforce it yet',
    })
  }
  return span({ test: 'policy-value', key, css: VALUE_CLASS, text: value.text })
}

// Splits a text node around its tokens, keeping the prose either side in order.
function splitText(text: string, values: PolicyValues): Node[] {
  const parts: Node[] = []
  let at = 0

  for (const match of text.matchAll(policyTokenPattern())) {
    const start = match.index ?? 0
    if (start > at) parts.push(text.slice(at, start))
    parts.push(nodesFor(match[1]!, values))
    at = start + match[0].length
  }

  if (at < text.length) parts.push(text.slice(at))
  return parts
}

export function resolvePolicyTree<T>(tree: T, values: PolicyValues): T {
  if (!isTree(tree)) return tree

  const walk = (node: Node): Node[] => {
    if (typeof node === 'string') return splitText(node, values)

    const bound = bindingKey(node)
    if (bound) return [nodesFor(bound, values)]

    const [tag, props, ...children] = node as [string, unknown, ...Node[]]
    return [[tag, props, ...children.flatMap(walk)]]
  }

  return { ...tree, value: tree.value.flatMap(walk) } as T
}
