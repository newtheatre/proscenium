import { describe, expect, test } from 'bun:test'
import { saysTrainingAction, trainingAction } from '#shared/utils/training-action'
import type { ActionSession } from '#shared/utils/training-action'

// Issue 1335: one derived action for a module wherever a member meets it (the rota's role cards,
// My training, the catalogue and the module page). Ask is offered only when no session is open.

const session = (over: Partial<ActionSession> = {}): ActionSession => ({
  id: 's-1',
  heldOn: '2026-10-08',
  startsAt: '19:00',
  place: 'The Studio',
  full: false,
  open: true,
  placed: null,
  waitlistPosition: null,
  ...over,
})

describe('the one action a member is offered for a module', () => {
  test('a session with places open is Sign up, whether or not they asked before', () => {
    expect(trainingAction([session()], false)).toMatchObject({ kind: 'SIGN_UP', session: { id: 's-1' } })
    expect(trainingAction([session()], true)).toMatchObject({ kind: 'SIGN_UP' })
  })

  test('a full one is Join the waiting list', () => {
    expect(trainingAction([session({ full: true })], false)).toMatchObject({ kind: 'JOIN_WAITING_LIST' })
  })

  test('a place already held says so, ahead of any other session', () => {
    const action = trainingAction([session({ id: 's-0' }), session({ id: 's-2', placed: true })], false)
    expect(action).toMatchObject({ kind: 'PLACED', session: { id: 's-2' } })
  })

  test('a place held on a later session beats a waiting place on an earlier one', () => {
    const action = trainingAction([session({ id: 's-0', placed: false, waitlistPosition: 1 }), session({ id: 's-2', placed: true })], false)
    expect(action).toMatchObject({ kind: 'PLACED', session: { id: 's-2' } })
  })

  test('a waiting place says its number', () => {
    expect(trainingAction([session({ placed: false, waitlistPosition: 3 })], false)).toMatchObject({ kind: 'WAITING', position: 3 })
  })

  test('a session closed to them, or blocked by a missing prerequisite, is not offered', () => {
    expect(trainingAction([session({ open: false })], false)).toEqual({ kind: 'ASK' })
  })

  test('no session open is Ask, or Asked for once they have', () => {
    expect(trainingAction([], false)).toEqual({ kind: 'ASK' })
    expect(trainingAction([], true)).toEqual({ kind: 'ASKED' })
  })
})

describe('what each action says', () => {
  test('in the words the review agreed', () => {
    expect(saysTrainingAction({ kind: 'SIGN_UP', session: session() })).toBe('Sign up')
    expect(saysTrainingAction({ kind: 'JOIN_WAITING_LIST', session: session() })).toBe('Join the waiting list')
    expect(saysTrainingAction({ kind: 'PLACED', session: session() })).toBe('You have a place')
    expect(saysTrainingAction({ kind: 'WAITING', session: session(), position: 2 })).toBe('On the waiting list, number 2')
    expect(saysTrainingAction({ kind: 'ASK' })).toBe('Ask for this module')
    expect(saysTrainingAction({ kind: 'ASKED' })).toBe('Asked for')
  })
})
