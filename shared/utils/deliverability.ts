// The one place an address is judged undeliverable (H-107 criterion 3). A caller's mistake
// cannot leak a placeholder past this, because nothing else decides.

// Reserved by RFC 2606 and RFC 6761: mail to these can never arrive.
const UNDELIVERABLE_SUFFIXES = ['.invalid', '.test', '.example', '.localhost']
const UNDELIVERABLE_DOMAINS = ['example.com', 'example.org', 'example.net', 'localhost']

// Anonymisation rewrites an address to this shape (0011), and the old estate left merged
// customers on a placeholder of its own.
const PLACEHOLDER_PATTERNS = [/^deleted-[^@]*@/i, /^merged-[^@]*@/i]

export type Undeliverable = 'undeliverable-domain' | 'placeholder-address' | 'anonymised' | 'no-address'

export interface Recipient {
  email: string | null
  anonymisedAt: number | null
}

// Returns why an address must not be handed to the provider, or null.
export function undeliverableReason(recipient: Recipient): Undeliverable | null {
  if (recipient.anonymisedAt !== null) return 'anonymised'

  const email = recipient.email?.trim().toLowerCase()
  if (!email || !email.includes('@')) return 'no-address'

  if (PLACEHOLDER_PATTERNS.some(pattern => pattern.test(email))) return 'placeholder-address'

  const domain = email.slice(email.lastIndexOf('@') + 1)
  if (UNDELIVERABLE_DOMAINS.includes(domain)) return 'undeliverable-domain'
  if (UNDELIVERABLE_SUFFIXES.some(suffix => domain.endsWith(suffix))) return 'undeliverable-domain'

  return null
}

export function isDeliverable(recipient: Recipient): boolean {
  return undeliverableReason(recipient) === null
}
