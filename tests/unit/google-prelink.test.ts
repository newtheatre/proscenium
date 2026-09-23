import { describe, expect, test } from 'bun:test'
import { isAuditAction } from '#shared/utils/audit-actions'
import {
  PRELINK_ALREADY_GOOGLE,
  PRELINK_ERASED,
  PRELINK_NOT_WORKSPACE,
  preLinkAddress,
  preLinkDetail,
  preLinkHeldBy,
  preLinkRefusal,
} from '#shared/utils/google-prelink'
import type { PreLinkTarget } from '#shared/utils/google-prelink'

// A-104 criterion 6 and 0008: what refuses a pre-link, decided before anything is written.

const open: PreLinkTarget = { googleSub: null, anonymisedAt: null }
const workspace = 'incoming.officer@newtheatre.org.uk'

describe('who may be pre-linked, and to what', () => {
  test('a Workspace address on an account with no Google link is accepted', () => {
    expect(preLinkRefusal(open, workspace, null)).toBeNull()
  })

  test('a personal address is refused before anything else is looked at', () => {
    expect(preLinkRefusal(open, 'someone@example.com', null)).toEqual({ statusCode: 400, statusMessage: PRELINK_NOT_WORKSPACE })
  })

  test('an account already linked to Google is refused', () => {
    expect(preLinkRefusal({ ...open, googleSub: 'sub-1' }, workspace, null)).toEqual({ statusCode: 409, statusMessage: PRELINK_ALREADY_GOOGLE })
  })

  test('an erased account is refused, setting or clearing', () => {
    const erased = { ...open, anonymisedAt: 1 }
    expect(preLinkRefusal(erased, workspace, null)).toEqual({ statusCode: 409, statusMessage: PRELINK_ERASED })
    expect(preLinkRefusal(erased, null, null)).toEqual({ statusCode: 409, statusMessage: PRELINK_ERASED })
  })

  test('clearing is never refused for a live account', () => {
    expect(preLinkRefusal({ ...open, googleSub: 'sub-1' }, null, null)).toBeNull()
  })
})

describe('an address that already leads somewhere else', () => {
  test('another account\'s own address names that account and points to merge', () => {
    const refusal = preLinkRefusal(open, workspace, { name: 'Jo Bloggs', how: 'email' })
    expect(refusal?.statusCode).toBe(409)
    expect(refusal?.statusMessage).toContain('Jo Bloggs')
    expect(refusal?.statusMessage).toMatch(/merge/i)
  })

  test('another account\'s pending link names that account and points to merge', () => {
    const said = preLinkHeldBy({ name: 'Jo Bloggs', how: 'pending' })
    expect(said).toContain('waiting to be linked')
    expect(said).toContain('Jo Bloggs')
    expect(said).toMatch(/merge/i)
    expect(preLinkRefusal(open, workspace, { name: 'Jo Bloggs', how: 'pending' })?.statusMessage).toBe(said)
  })
})

describe('the address is stored as sign-in reads it', () => {
  test('lowercased and trimmed, exactly as the Google callback normalises the identity', () => {
    expect(preLinkAddress('  Incoming.Officer@NewTheatre.org.uk ')).toBe(workspace)
    expect(preLinkAddress(null)).toBeNull()
  })
})

describe('the trail (0011)', () => {
  test('the detail carries no address', () => {
    expect(preLinkDetail(true)).toEqual({ replaced: true })
    expect(JSON.stringify(preLinkDetail(false))).not.toContain('@')
  })

  test('setting, clearing and both claims are registered actions', () => {
    for (const action of ['account.google.prelinked', 'account.google.unlinked', 'account.google.claimed', 'account.google.claimed.pending']) {
      expect(isAuditAction(action)).toBe(true)
    }
  })
})
