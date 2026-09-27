import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { runEachStep } from '#server/utils/run-steps'

// A nightly task is a list of independent steps: one that throws must not cost the others their
// turn (a role lapse, a purge), and the run must still fail so the fault is never silent.

const logged = spyOn(console, 'error').mockImplementation(() => {})

afterEach(() => {
  logged.mockClear()
})

describe('every step runs, whatever happened to the one before', () => {
  test('with nothing failing, each step\'s result comes back under its name', async () => {
    const answered = await runEachStep('nightly', {
      first: async () => 3,
      second: async () => ({ lapsed: 1 }),
    })
    expect(answered).toEqual({ first: 3, second: { lapsed: 1 } })
    expect(logged).not.toHaveBeenCalled()
  })

  test('a step that throws does not stop the steps after it, and the run still fails naming it', async () => {
    const ran: string[] = []
    const run = runEachStep('nightly', {
      purge: async () => {
        ran.push('purge')
        throw new Error('one row would not go')
      },
      lapses: async () => {
        ran.push('lapses')
        return 2
      },
      prune: async () => {
        ran.push('prune')
        return 0
      },
    })

    await expect(run).rejects.toThrow(/nightly.*purge/)
    expect(ran).toEqual(['purge', 'lapses', 'prune'])
    expect(logged).toHaveBeenCalledTimes(1)
    expect(String(logged.mock.calls[0]![0])).toContain('[nightly] purge')
  })

  test('every failing step is logged by name and named in the failure, and none hides another', async () => {
    const run = runEachStep('nightly', {
      first: async () => {
        throw new Error('first')
      },
      middle: async () => 1,
      last: async () => {
        throw new Error('last')
      },
    })

    await expect(run).rejects.toThrow(/first, last/)
    expect(logged.mock.calls.map(call => String(call[0]))).toEqual(['[nightly] first failed', '[nightly] last failed'])
  })
})

describe('the nightly sweeps and the tombstone purge go through it (#1494 review)', () => {
  test('daily:sweeps runs every step through runEachStep and awaits none of them itself', async () => {
    const source = await Bun.file('server/tasks/daily/sweeps.ts').text()
    expect(source).toContain('runEachStep(\'daily:sweeps\'')
    expect(source).not.toMatch(/^\s*(const \w+ = )?await (sweep|purge|prune|remind|expire)\w*\(/m)
  })

  test('the tombstone sweep tries every row, so one that throws does not keep the rest', async () => {
    const source = await Bun.file('server/utils/access-profiles.ts').text()
    expect(source).toContain('runEachStep(\'access-profile tombstones\'')
  })
})
