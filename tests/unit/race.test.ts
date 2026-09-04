import { describe, expect, test } from 'bun:test'
import { expectOneWinner, race } from '#tests/helpers/race'

// The harness every racing test in the suite fires concurrent attempts through (K-105).

describe('race', () => {
  test('every attempt is called, and results come back in index order regardless of timing', async () => {
    const finishedInOrder: number[] = []
    const delays = [30, 0, 10]

    const results = await race(3, async (index) => {
      await new Promise(resolve => setTimeout(resolve, delays[index]))
      finishedInOrder.push(index)
      return index * 10
    })

    expect(results).toEqual([0, 10, 20])
    // The slowest attempt (index 0) is called first but settles last: proof the calls overlapped.
    expect(finishedInOrder[0]).not.toBe(0)
  })

  test('a rejection is not swallowed', async () => {
    await expect(race(2, async (index) => {
      if (index === 1) throw new Error('lost the race')
      return index
    })).rejects.toThrow('lost the race')
  })
})

describe('expectOneWinner', () => {
  test('passes when exactly one attempt won and the rest lost on the named status', () => {
    expect(() => expectOneWinner([{ status: 200 }, { status: 409 }, { status: 409 }])).not.toThrow()
  })

  test('fails when nobody won', () => {
    expect(() => expectOneWinner([{ status: 409 }, { status: 409 }])).toThrow()
  })

  test('fails when two attempts both won', () => {
    expect(() => expectOneWinner([{ status: 200 }, { status: 200 }, { status: 409 }])).toThrow()
  })

  test('fails when a loser answered with a status that is not the named loser', () => {
    expect(() => expectOneWinner([{ status: 200 }, { status: 500 }])).toThrow()
  })

  test('the winner and loser status are configurable, for a race that is not HTTP at all', () => {
    expect(() => expectOneWinner([{ status: 1 }, { status: 0 }, { status: 0 }], 1, 0)).not.toThrow()
  })
})
