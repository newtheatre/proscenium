import { describe, expect, it } from 'vitest'
import { rowMenu } from '../../layers/core/app/utils/row-menu'

const edit = { label: 'Edit' }
const remove = { label: 'Remove' }

describe('a row\'s right-click menu', () => {
  it('offers what the ellipsis menu offers, then Open in a new tab for a row that is a link', () => {
    expect(rowMenu([edit, remove], '/console/things/1', 'Open in a new tab')).toEqual([
      [edit, remove],
      [{ label: 'Open in a new tab', icon: 'i-lucide-external-link', to: '/console/things/1', target: '_blank' }],
    ])
  })
  it('keeps the groups the ellipsis menu has', () => {
    expect(rowMenu([[edit], [remove]], undefined, 'Open')).toEqual([[edit], [remove]])
  })
  it('is empty for a row with no actions, link or not', () => {
    expect(rowMenu(undefined, '/console/things/1', 'Open')).toEqual([])
    expect(rowMenu([], '/console/things/1', 'Open')).toEqual([])
    expect(rowMenu([[]], undefined, 'Open')).toEqual([])
  })
})
