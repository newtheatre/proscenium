import { describe, expect, test } from 'bun:test'

// The routes' half of the two erasure races (0011, 0003): the statements are pinned against the
// real migrations in `tests/integration/erasure-races.test.ts`.

const source = (path: string): Promise<string> => Bun.file(path).text()

describe('the Google callback after a claim that an erasure or a disable beat', () => {
  test('the claim goes through the one statement, which carries the account\'s state', async () => {
    const route = await source('server/routes/auth/google.get.ts')
    expect(route).toContain('googleClaimStatement(userId, identity.sub, now)')
    expect(await source('shared/utils/google-sign-in.ts')).toContain('AND anonymised_at IS NULL AND disabled = 0')
  })

  // The code names no account state, as the other refusal of an unusable account does (A-122).
  test('an account erased or disabled by the time it is read is refused, with no session', async () => {
    const route = await source('server/routes/auth/google.get.ts')
    expect(route).toContain('if (!account || account.anonymisedAt !== null || account.disabled) return sendRedirect(event, \'/sign-in?refused=account\')')
  })
})
