import { describe, expect, test } from 'bun:test'
import {
  committeeSchema,
  committeeTokenProblem,
  committeeValues,
  mayBeOutOfDate,
  quotesCommittee,
  saysHolders,
} from '#shared/utils/committee'
import type { Committee } from '#shared/utils/committee'
import { resolvePolicyTree } from '#shared/utils/policy-tokens'

// 0107, D-103 criteria 10 and 11: the committee is one data file, quoted by token, and a page
// quoting it says so once the handover has passed without an edit.

// Section 4 of the 2026/27 constitution, in its order.
const CONSTITUTION = [
  'President',
  'Secretary and Welfare Officer',
  'Treasurer',
  'Front of House Manager',
  'In-House Coordinator',
  'Studio Coordinator',
  'Creatives Coordinator',
  'External Relations Manager',
  'Marketing Coordinator',
  'Social and Fundraising Coordinator',
  'Theatre Manager',
  'Company Stage Manager',
  'Company Technical Director',
  'Technical Manager',
  'Company Workshop Manager',
  'Costume, Props and Make-Up Manager',
  'Archivist',
  'Events and Engagement Coordinator',
]

const fixture: Committee = {
  updatedOn: '2026-09-28',
  roles: [
    { key: 'PRESIDENT', title: 'President', email: 'president@newtheatre.org.uk', holders: ['Ada Example'] },
    { key: 'COMPANY_TECHNICAL_DIRECTOR', title: 'Company Technical Director', holders: ['Bea Example', 'Cal Example'] },
    { key: 'TECHNICAL_MANAGER', title: 'Technical Manager', email: 'techmanager@newtheatre.org.uk', holders: [] },
  ],
}

describe('the committee file (0107)', () => {
  const load = async (): Promise<Committee> => committeeSchema.parse(Bun.YAML.parse(await Bun.file('content/committee.yml').text()))

  test('parses, and lists the constitution\'s roles in its order', async () => {
    expect((await load()).roles.map(role => role.title)).toEqual(CONSTITUTION)
  })

  test('every key is unique and cannot be mistaken for a field', async () => {
    const keys = (await load()).roles.map(role => role.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys.filter(key => /_(NAME|EMAIL)$/.test(key))).toEqual([])
  })

  // A role address or nothing: a member's own address never belongs on a public page (0011).
  test('every address is the theatre\'s own', async () => {
    const stray = (await load()).roles.filter(role => role.email && !role.email.endsWith('@newtheatre.org.uk'))
    expect(stray.map(role => role.key)).toEqual([])
  })

  test('a date that is not a date is refused', () => {
    expect(committeeSchema.safeParse({ ...fixture, updatedOn: 'last September' }).success).toBe(false)
  })
})

describe('holders read as a person says them', () => {
  test('one, two and three names', () => {
    expect(saysHolders(['Ada'])).toBe('Ada')
    expect(saysHolders(['Ada', 'Bea'])).toBe('Ada and Bea')
    expect(saysHolders(['Ada', 'Bea', 'Cal'])).toBe('Ada, Bea and Cal')
  })

  test('nobody supplied yet is a bracketed gap, never a guess', () => {
    expect(saysHolders([])).toBe('[name goes here]')
  })
})

describe('committee tokens (D-103 criterion 10)', () => {
  test('a role and a field the file has are accepted', () => {
    expect(committeeTokenProblem('COMMITTEE_TECHNICAL_MANAGER_NAME', fixture)).toBeNull()
    expect(committeeTokenProblem('COMMITTEE_PRESIDENT_EMAIL', fixture)).toBeNull()
  })

  test('a role the file does not have is refused by name', () => {
    expect(committeeTokenProblem('COMMITTEE_HEAD_OF_LIGHTING_NAME', fixture)).toContain('HEAD_OF_LIGHTING')
  })

  test('a field other than a name or an address is refused', () => {
    expect(committeeTokenProblem('COMMITTEE_PRESIDENT_PHONE', fixture)).not.toBeNull()
  })

  test('a name resolves to its holders, or to the gap', () => {
    const values = committeeValues(['COMMITTEE_COMPANY_TECHNICAL_DIRECTOR_NAME', 'COMMITTEE_TECHNICAL_MANAGER_NAME'], fixture)
    expect(values.COMMITTEE_COMPANY_TECHNICAL_DIRECTOR_NAME?.text).toBe('Bea Example and Cal Example')
    expect(values.COMMITTEE_TECHNICAL_MANAGER_NAME?.text).toBe('[name goes here]')
  })

  test('an address renders as a mail link', () => {
    const values = committeeValues(['COMMITTEE_PRESIDENT_EMAIL'], fixture)
    const tree = { type: 'minimark', value: [['p', {}, 'Write to {{COMMITTEE_PRESIDENT_EMAIL}}.']] }
    const resolved = JSON.stringify(resolvePolicyTree(tree, values))
    expect(resolved).toContain('"href":"mailto:president@newtheatre.org.uk"')
    expect(resolved).not.toContain('applied by hand')
  })

  // J-110 criterion 6, applied to a role nobody has given an address: the sentence goes whole.
  test('a role with no address drops the sentence quoting it', () => {
    const values = committeeValues(['COMMITTEE_COMPANY_TECHNICAL_DIRECTOR_EMAIL'], fixture)
    const tree = { type: 'minimark', value: [['p', {}, 'Write to {{COMMITTEE_COMPANY_TECHNICAL_DIRECTOR_EMAIL}}.'], ['p', {}, 'Kept.']] }
    expect(JSON.stringify(resolvePolicyTree(tree, values))).toBe(JSON.stringify({ type: 'minimark', value: [['p', {}, 'Kept.']] }))
  })

  test('a role the file does not have resolves to nothing, which renders as the visible error', () => {
    expect(committeeValues(['COMMITTEE_HEAD_OF_LIGHTING_NAME'], fixture)).toEqual({})
  })
})

describe('a page that quotes the committee', () => {
  test('by token or by the table', () => {
    expect(quotesCommittee({ type: 'minimark', value: [['p', {}, 'Ask {{COMMITTEE_PRESIDENT_NAME}}.']] })).toBe(true)
    expect(quotesCommittee({ type: 'minimark', value: [['div', {}, ['committee-table', {}]]] })).toBe(true)
    expect(quotesCommittee({ type: 'minimark', value: [['p', {}, 'Ask {{BOOKING_WINDOW_DAYS}}.']] })).toBe(false)
  })
})

describe('the list may be out of date after the handover (D-103 criterion 11)', () => {
  test('August is the handover\'s grace month: no warning yet', () => {
    expect(mayBeOutOfDate('2026-07-31', '2026-08-01')).toBe(false)
    expect(mayBeOutOfDate('2026-07-31', '2026-08-31')).toBe(false)
  })

  test('from 1 September, a list last touched before 1 August is flagged', () => {
    expect(mayBeOutOfDate('2026-07-31', '2026-09-01')).toBe(true)
    expect(mayBeOutOfDate('2025-11-02', '2027-03-01')).toBe(true)
  })

  test('a list updated on or after 1 August stands for the whole committee year', () => {
    expect(mayBeOutOfDate('2026-08-01', '2026-09-01')).toBe(false)
    expect(mayBeOutOfDate('2026-09-28', '2027-07-31')).toBe(false)
  })

  test('the year turns in August, not January', () => {
    expect(mayBeOutOfDate('2025-09-01', '2026-07-31')).toBe(false)
    expect(mayBeOutOfDate('2025-09-01', '2026-09-01')).toBe(true)
  })
})
