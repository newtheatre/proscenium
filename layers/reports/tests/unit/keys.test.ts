// R3-27: a module's breakdown key never lists people; figures per person have their own fenced point.
import { describe, expect, it } from 'vitest'
import { checkedValues } from '../../server/keys'

describe('reports.key values', () => {
  it('passes ordinary values and refuses account ids or email addresses', () => {
    expect(checkedValues('box-office.channel', [{ value: 'desk', label: 'Desk' }])).toHaveLength(1)
    expect(() => checkedValues('x.people', [{ value: 'acc_123', label: 'Someone' }])).toThrow()
    expect(() => checkedValues('x.people', [{ value: 'one', label: 'a@b.org' }])).toThrow()
  })
})
