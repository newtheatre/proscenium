// Calculated values (FB-104) once a form is answered: the server works them out again and keeps only
// its own; they are shown with their names in the response, the table and the person's own copy, and
// exported under their export names. One worked out from a special-category answer is as restricted
// as the answer.
import { beforeAll, describe, expect, it } from 'vitest'
import { person, rows } from '../../../../tests/integration/helpers'
import { NOV_17, account, offered, question, raw, ready, req, send } from './stage'
import type { Definition } from '../../shared/engine'

const reader = person(['forms.response.read'], { name: 'Cal Reader' })
const exporter = person(['forms.response.export', 'forms.response.read'], { name: 'Cal Exporter', reassertedAt: NOV_17 + 86_400_000 })
const welfare = person(['forms.response.read', 'forms.response.read-special', 'forms.response.export'], { name: 'Cal Welfare', reassertedAt: NOV_17 + 86_400_000 })
const member = person([], { name: 'Cal Member' })

beforeAll(async () => {
  await ready()
  for (const who of [reader, exporter, welfare, member]) await account(who)
})

const budget = (): Definition => ({
  format: 1,
  pages: [
    { id: 'p1', title: 'Costs', items: [
      question('set', { type: 'money', label: 'Set' }),
      question('costume', { type: 'money', label: 'Costume' }),
      question('seats', { type: 'number', label: 'Seats' }),
      question('help', { type: 'number', label: 'Support hours', dataClass: 'special' }),
    ] },
    { id: 'p2', title: 'Sales', items: [question('sold', { type: 'number', label: 'Sold' })] },
  ],
  calculations: [
    { id: 'total', key: 'total_budget', type: 'money', label: 'Total budget', page: 'p1', expression: { fn: 'add', args: [{ answer: 'set' }, { answer: 'costume' }] } },
    { id: 'full', key: 'how_full', type: 'percent', label: 'How full', page: 'p2', expression: { fn: 'divide', args: [{ answer: 'sold' }, { answer: 'seats' }] } },
    { id: 'each', key: 'cost_per_seat', type: 'money', label: 'Cost per seat', expression: { fn: 'divide', args: [{ calculation: 'total' }, { answer: 'seats' }] } },
    { id: 'care', key: 'care_hours', type: 'number', label: 'Care hours', expression: { fn: 'multiply', args: [{ answer: 'help' }, { value: 2 }] } },
  ],
})

describe('calculated values', () => {
  let formId = ''
  let responseId = ''
  beforeAll(async () => {
    const offer = await offered(budget())
    formId = offer.formId
    // The browser sends its own total with the answers; it is not kept.
    const sent = await send(offer.slug, { set: 30000, costume: 18000, seats: 120, sold: 90, help: 3 }, member, { calculated: { total: 1 } })
    expect(sent.status, JSON.stringify(sent.body)).toBe(200)
    responseId = sent.body.responseId
  })

  it('keeps the values the server worked out, and nothing the browser sent', async () => {
    const [row] = await rows<{ calculated: string }>('SELECT calculated FROM forms_responses WHERE id = ?', responseId)
    expect(JSON.parse(row!.calculated)).toEqual({ total: 48000, full: 0.75, each: 400, care: 6 })
  })

  it('shows them in the response, leaving out one read from a restricted answer until it is opened', async () => {
    const one = await req('GET', `/api/forms/forms/${formId}/responses/${responseId}`, undefined, reader)
    expect(one.status, JSON.stringify(one.body)).toBe(200)
    expect(one.body.calculated).toEqual({ total: 48000, full: 0.75, each: 400 })
    expect(one.body.definition.calculations.map((c: { label: string }) => c.label)).toEqual(['Total budget', 'How full', 'Cost per seat', 'Care hours'])
    const opened = await req('GET', `/api/forms/forms/${formId}/responses/${responseId}?reveal=1`, undefined, welfare)
    expect(opened.body.calculated).toEqual({ total: 48000, full: 0.75, each: 400, care: 6 })
  })

  it('gives the table a column per calculation, marking a restricted one', async () => {
    const table = await req('GET', `/api/forms/forms/${formId}/responses`, undefined, reader)
    expect(table.body.calculations).toEqual([
      { id: 'total', key: 'total_budget', label: 'Total budget', type: 'money', restricted: false },
      { id: 'full', key: 'how_full', label: 'How full', type: 'percent', restricted: false },
      { id: 'each', key: 'cost_per_seat', label: 'Cost per seat', type: 'money', restricted: false },
      { id: 'care', key: 'care_hours', label: 'Care hours', type: 'number', restricted: true },
    ])
    expect(table.body.rows[0].figures).toEqual({ total: 48000, full: 0.75, each: 400 })
  })

  it('exports them under their export names, the restricted one only when asked for', async () => {
    const csv = await raw('GET', `/api/forms/forms/${formId}/responses/export`, exporter)
    expect(csv.status, csv.text).toBe(200)
    const [header, line] = csv.text.trim().split('\r\n')
    expect(header!.split(',').slice(-3)).toEqual(['total_budget', 'how_full', 'cost_per_seat'])
    expect(line!.split(',').slice(-3)).toEqual(['480.00', '75%', '4.00'])
    const full = await raw('GET', `/api/forms/forms/${formId}/responses/export?special=1`, welfare)
    const [fullHeader, fullLine] = full.text.trim().split('\r\n')
    expect(fullHeader!.split(',').slice(-2)).toEqual(['cost_per_seat', 'care_hours'])
    expect(fullLine!.split(',').at(-1)).toBe('6')
  })

  it('shows the person their own, only those they saw on a page', async () => {
    const mine = await req('GET', `/api/forms/mine/${responseId}`, undefined, member)
    expect(mine.status, JSON.stringify(mine.body)).toBe(200)
    expect(mine.body.calculated).toEqual({ total: 48000, full: 0.75 })
  })
})
