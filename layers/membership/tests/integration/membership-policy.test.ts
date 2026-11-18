// The membership terms (/policies/membership): declared by membership, with a section only the
// theatre can write left off until it is written.
import { beforeAll, describe, expect, it } from 'vitest'
import { listPolicies, policyText, resolvePolicy } from '../../../core/server/policies/service'
import { inContext, setModule } from '../../../../tests/integration/helpers'

beforeAll(async () => {
  await setModule('membership', true)
})

describe('the membership terms', () => {
  it('are a policy of the membership module, agreed to on joining', async () => {
    const found = (await inContext(() => listPolicies())).find(p => p.id === 'membership')
    expect(found).toMatchObject({ title: 'Membership terms', kind: 'terms', accepted: 'joining', module: 'membership' })
  })

  it('read whole, and leave what members get for the theatre to write', async () => {
    const resolved = await inContext(() => resolvePolicy('membership'))
    expect(resolved!.unwritten.map(s => s.id)).toEqual(['what-membership-gives-you'])
    const text = policyText(resolved!)
    expect(text).toContain('It does not renew automatically')
    // No qualifying period for voting is set, so the terms say nothing about one.
    expect(text).not.toContain('You can vote at our meetings')
    expect(text).not.toMatch(/ {2}| \.|:setting|:fact|::/)
  })
})
