// Seed and test-data tooling that cannot touch production (K-120). Every person it generates is
// obviously synthetic and unreachable, so test data can never be mailed to a real member.

// Reserved by RFC 2606 and RFC 6761: nothing here can leave the machine.
const UNDELIVERABLE_DOMAIN = 'invalid'

const MARKERS = [
  'newtheatre.org.uk',
  '.workers.dev',
  'cloudflare',
  'd1.',
]

export class ProductionRefusal extends Error {}

// A target is local or it is refused. There is no flag to override this, because the only
// reason to add one is the mistake it exists to prevent.
export function assertLocalTarget(target: string): void {
  const value = target.trim().toLowerCase()

  if (value === ':memory:') return

  if (!value.startsWith('.data/') && !value.startsWith('/tmp/') && !value.startsWith('./.data/')) {
    throw new ProductionRefusal(`refusing to seed \`${target}\`: only :memory:, .data/ and /tmp/ are local targets (K-120)`)
  }
  for (const marker of MARKERS) {
    if (value.includes(marker)) {
      throw new ProductionRefusal(`refusing to seed \`${target}\`: it names a remote database (K-120)`)
    }
  }
}

export function assertNotProduction(environment: string | undefined = process.env.NODE_ENV): void {
  if (environment === 'production') {
    throw new ProductionRefusal('refusing to seed with NODE_ENV=production (K-120)')
  }
}

const FIRST = ['Understudy', 'Prompt', 'Spotlight', 'Curtain', 'Rigger', 'Flyman', 'Dresser']
const LAST = ['Testperson', 'Fixture', 'Placeholder', 'Sample', 'Example']

export interface SyntheticPerson {
  name: string
  email: string
}

// Named so nobody mistakes one for a member, and addressed so nothing can be delivered.
export function syntheticPerson(index: number): SyntheticPerson {
  const first = FIRST[index % FIRST.length]!
  const last = LAST[Math.floor(index / FIRST.length) % LAST.length]!
  return {
    name: `${first} ${last} (test)`,
    email: `${first}.${last}.${index}@test.${UNDELIVERABLE_DOMAIN}`.toLowerCase(),
  }
}

// A subdomain of ours with no MX record: undeliverable too, but registration refuses the
// RFC-reserved domains outright, so an account a test signs in to needs one of these.
const REGISTRABLE_DOMAIN = 'e2e.newtheatre.org.uk'

export function registrableAddress(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}@${REGISTRABLE_DOMAIN}`.toLowerCase()
}

// Generated at run time and returned once. Nothing here is committed, and a caller that does
// not print it has no way to recover it.
export function generatePassword(): string {
  return `test-${crypto.randomUUID()}`
}
