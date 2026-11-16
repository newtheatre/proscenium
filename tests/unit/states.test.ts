import { expect, it } from 'vitest'
import { canReturn } from '../../layers/core/kit/states'
it('only a held item can be returned', () => { expect(canReturn('held')).toBe(true); expect(canReturn('returned')).toBe(false) })
