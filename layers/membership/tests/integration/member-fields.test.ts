// The details a theatre keeps about its members (MEM-34): a record-mode form attached in the slot
// membership.member-fields for every membership, filled in by the holder on My membership and by
// staff who hold membership.membership.fields, and nobody else.
import { beforeAll, describe, expect, it } from 'vitest'
import { person, setModule } from '../../../../tests/integration/helpers'
import { OPEN, definition, publish, question, ready as formsReady, req as forms } from '../../../forms/tests/integration/stage'
import { applicant, officer, ready, req, scheme } from './stage'

const SLOT = 'membership.member-fields'
beforeAll(async () => {
  await formsReady()
  await ready()
  await setModule('forms', true)
})

describe('details kept about members', () => {
  it('are filled in by the holder and by staff who may, and by nobody else', async () => {
    const made = await forms('POST', '/api/forms/forms', { title: 'Course and year', mode: 'record' })
    const formId = made.body.formId as string
    expect((await publish(formId, definition(question('course', { dataClass: 'personal' }), question('year', { type: 'number' })))).status).toBe(200)
    expect((await forms('PUT', `/api/forms/slots/${SLOT}/*/${formId}`, OPEN)).status).toBe(403)
    expect((await forms('PUT', `/api/forms/slots/${SLOT}/*/${formId}`, OPEN, officer)).status).toBe(200)

    const id = await scheme()
    expect((await req('POST', `/api/membership/schemes/${id}/state`, { to: 'open' })).status).toBe(200)
    const eve = await applicant('Eve Holder')
    const { membershipId } = (await req('POST', `/api/membership/schemes/${id}/join`, {}, eve)).body
    expect((await req('GET', '/api/membership/mine', undefined, eve)).body.fields).toBe(true)

    const mine = await forms('GET', `/api/forms/records/${SLOT}/${membershipId}`, undefined, eve)
    expect(mine.status, JSON.stringify(mine.body)).toBe(200)
    expect((await forms('PUT', `/api/forms/records/${SLOT}/${membershipId}/${formId}`, { answers: { course: 'Drama', year: 2 }, revision: 0 }, eve)).body).toEqual({ revision: 1 })

    const stranger = await applicant('Sam Stranger')
    expect((await forms('GET', `/api/forms/records/${SLOT}/${membershipId}`, undefined, stranger)).status).toBe(403)
    const viewer = person(['membership.membership.view'])
    expect((await forms('GET', `/api/forms/records/${SLOT}/${membershipId}`, undefined, viewer)).status).toBe(403)
    expect((await req('GET', `/api/membership/memberships/${membershipId}`, undefined, viewer)).body.canEditFields).toBe(false)
    const clerk = person(['membership.membership.fields'])
    expect((await req('GET', `/api/membership/memberships/${membershipId}`, undefined, clerk)).body.canEditFields).toBe(true)
    expect((await forms('PUT', `/api/forms/records/${SLOT}/${membershipId}/${formId}`, { answers: { course: 'Drama', year: 3 }, revision: 1 }, clerk)).body).toEqual({ revision: 2 })
  })
})
