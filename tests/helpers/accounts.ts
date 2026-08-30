import { Database } from 'bun:sqlite'
import { registrableAddress, syntheticPerson } from './seed'
import type { AppUnderTest } from './webview'

// One fixture for the accounts every suite needs. A signed-in member has to have proved its
// address (0026), and thirteen suites were each doing the registration by hand.

export interface TestMember {
  id: string
  email: string
  name: string
  cookie: string
}

export function request(app: AppUnderTest, method: string, path: string, body?: unknown, cookie?: string): Promise<Response> {
  const carriesBody = method !== 'GET' && method !== 'HEAD'
  return fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    ...(carriesBody ? { body: JSON.stringify(body ?? {}) } : {}),
  })
}

function query<T>(app: AppUnderTest, sql: string, ...parameters: unknown[]): T | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return (database.query(sql).get(...parameters as never[]) as T | null) ?? undefined
  }
  finally {
    database.close()
  }
}

// Marked verified in the database rather than through the link: a suite that is not testing
// verification should not have to perform it, and the flow has its own tests.
export function markVerified(app: AppUnderTest, email: string): void {
  const database = new Database(app.databaseFile)
  try {
    database.query('UPDATE users SET verified = 1 WHERE email = ?').run(email)
  }
  finally {
    database.close()
  }
}

// A spent step cannot answer a second challenge, so a suite signing in again either waits out the
// thirty second window or forgets the step. Replay protection has its own tests (A-111).
export function forgetSpentStep(app: AppUnderTest, email: string): void {
  const database = new Database(app.databaseFile)
  try {
    database.query(`
      UPDATE totp_secrets SET last_used_step = NULL
      WHERE user_id = (SELECT id FROM users WHERE email = ?)
    `).run(email)
  }
  finally {
    database.close()
  }
}

export interface RegisterOptions {
  /** Leave the address unproven, for a suite that is testing what that refuses. */
  verify?: boolean
  /** Stop before signing in, for a suite that wants to drive that itself. */
  signIn?: boolean
}

export async function registerMember(
  app: AppUnderTest,
  prefix: string,
  password: string,
  options: RegisterOptions = {},
): Promise<TestMember> {
  const { verify = true, signIn = true } = options
  const person = syntheticPerson(Math.floor(Math.random() * 1_000_000))
  const email = registrableAddress(prefix)

  await request(app, 'POST', '/api/auth/register', { email, name: person.name, password })
  if (verify) markVerified(app, email)

  const id = query<{ id: string }>(app, 'SELECT id FROM users WHERE email = ?', email)!.id
  if (!signIn) return { id, email, name: person.name, cookie: '' }

  const signedIn = await request(app, 'POST', '/api/auth/sign-in', { email, password })
  return { id, email, name: person.name, cookie: (signedIn.headers.get('set-cookie') ?? '').split(';')[0]! }
}
