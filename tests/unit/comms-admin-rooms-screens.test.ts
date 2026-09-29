import { describe, expect, test } from 'bun:test'

// The comms, admin and rooms console screens, read as source: a count before the draft, a draft
// that survives its own send, a flag that says what it does, and one truth per field (item 10).

const read = (path: string): Promise<string> => Bun.file(path).text()

const ANNOUNCE = 'app/pages/comms/announce.vue'
const SETTINGS = 'app/pages/admin/settings.vue'
const BACKUPS = 'app/pages/admin/backups.vue'
const ROOMS = 'app/pages/rooms/manage/index.vue'
const UTILISATION = 'app/pages/rooms/manage/utilisation.vue'

describe('the composer counts before the draft and keeps it after (H-108 criterion 7)', () => {
  test('the audience count is read as the audience changes, not only on a preview', async () => {
    const source = await read(ANNOUNCE)
    expect(source).toContain('data-test="audience-count"')
    expect(source).toContain('/api/admin/comms/announcements/audience')
    expect(source).toContain('saysAudienceCount')
  })

  test('the send path empties neither the subject nor the message', async () => {
    const source = await read(ANNOUNCE)
    const sending = source.split('async function send(')[1]?.split('</script>')[0] ?? ''
    expect(sending).not.toContain('subject.value = \'\'')
    expect(sending).not.toContain('body.value = \'\'')
    expect(sending).toContain('sent.value =')
  })

  test('the screen says it went, and offers a way to start another', async () => {
    const source = await read(ANNOUNCE)
    expect(source).toContain('saysAnnouncementSent')
    expect(source).toContain('data-test="announce-sent"')
    expect(source).toContain('data-test="announce-again"')
  })
})

describe('a setting nothing reads says so (J-104 criterion 6)', () => {
  test('the badge says what is true of the flag, not what is coming', async () => {
    const source = await read(SETTINGS)
    expect(source).not.toContain('Not enforced yet')
    expect(source).toContain('Nothing enforces this')
  })

  test('no word on the screen points at a future', async () => {
    const source = await read(SETTINGS)
    for (const word of ['not yet', 'for now', 'coming soon']) expect(source.toLowerCase()).not.toContain(word)
  })
})

// Issue 1357: rules, not keys. A card is headed in words with its key beneath, a reader is shown
// values and nothing to press, and the limits on the machinery are folded away.
describe('the settings screen reads as rules', () => {
  test('a card is headed in words, with the key beneath it and the unit beside the number', async () => {
    const source = await read(SETTINGS)
    expect(source).toContain('configHeading(setting.key)')
    expect(source).toContain(':data-test="`key-${setting.key}`"')
    expect(source).toContain('configUnit(setting.key)')
  })

  test('the search finds a setting by its heading too', async () => {
    const source = await read(SETTINGS)
    expect(source).toMatch(/configHeading\(setting\.key\)\.toLowerCase\(\)\.includes\(term\)/)
  })

  test('a reader of the settings is shown each value in words and no input', async () => {
    const source = await read(SETTINGS)
    expect(source).toContain('can(useViewer().value, editSettings)')
    expect(source).toContain('v-if="!setting.synced && edits"')
    expect(source).toContain(':data-test="`value-${setting.key}`"')
    expect(source).toContain('saysConfigValue(')
    expect(await read('app/components/settings/BankHolidaySync.vue')).toContain('v-if="!readOnly"')
  })

  test('the technical limits are folded away until opened or searched for', async () => {
    const source = await read(SETTINGS)
    expect(source).toContain('isTechnical(')
    expect(source).toContain('data-test="technical-limits"')
  })

  // The floor is the server's to enforce; the picker only stops somebody trying (0009).
  test('the second-factor roles on the floor cannot be unticked in the picker', async () => {
    expect(await read(SETTINGS)).toContain(':fixed="roleFloor(setting.key)"')
    expect(await read('app/components/settings/RolesField.vue')).toMatch(/disabled: props\.fixed/)
  })

  // J-105 criterion 6: a flagged revert opens the same preview and typed echo a flagged save does.
  test('reverting a flagged setting asks for the typed confirmation, and the route checks it', async () => {
    const source = await read(SETTINGS)
    expect(source).toMatch(/async function revert\(setting: Setting\): Promise<void> \{\s*if \(setting\.wideBlastRadius\)/)
    expect(source).toContain('body: { confirmation }')
    const route = await read('server/api/admin/config/[key]/revert.post.ts')
    expect(route).toContain('requireBlastRadiusConfirmation(')
    expect(await read('server/api/admin/config/[key].put.ts')).toContain('requireBlastRadiusConfirmation(')
  })

  // A preview can turn on the value itself (AUTO_CLOSE_FROM_NIGHT): a save checks the echo against
  // the value it writes, a revert against the prior value, and the screen previews the same one.
  test('the save, the revert and the screen preview the value that would actually be written', async () => {
    expect(await read('server/api/admin/config/[key].put.ts')).toContain('requireBlastRadiusConfirmation(event, key, input.confirmation, input.value)')
    expect(await read('server/api/admin/config/[key]/revert.post.ts')).toContain('requireBlastRadiusConfirmation(event, key, input?.confirmation, prior.value)')
    expect(await read('server/api/admin/config/[key]/blast-radius.get.ts')).toContain('(await priorConfigValue(key))?.value')
    expect(await read(SETTINGS)).toContain(`isRevert ? { revert: 'true' } : { value: JSON.stringify(value) }`)
  })

  // A list stored below the floor would otherwise refuse every save with no way to put it right.
  test('a floor role stored off the list can be ticked back, so the save that repairs it is possible', async () => {
    expect(await read('app/components/settings/RolesField.vue'))
      .toContain('disabled: props.fixed.includes(role) && model.value.includes(role)')
  })
})

describe('the backups screen says where a restore happens (J-107 criterion 6)', () => {
  test('it names who does one and where the steps are', async () => {
    const source = await read(BACKUPS)
    expect(source).toContain('data-test="where-restoring-happens"')
    expect(source).toContain('/docs/system/backups')
  })
})

describe('one truth about a room override (C-106 criterion 7)', () => {
  test('each field takes its floor from the declaration, not from a typed-in number', async () => {
    const source = await read(ROOMS)
    expect(source).toContain('ROOM_OVERRIDE_FLOORS')
    expect(source).toContain('saysOverrideFloor')
  })

  test('the paragraph no longer claims nought is allowed everywhere', async () => {
    const source = await read(ROOMS)
    expect(source).not.toContain('nought is a real answer meaning none needed.')
  })
})

describe('the utilisation span is a London committee year (C-117 criterion 6)', () => {
  test('the screen takes the span from the shared helper', async () => {
    const source = await read(UTILISATION)
    expect(source).toContain('committeeYearToDate')
  })

  test('nothing on the screen computes a year in UTC', async () => {
    const source = await read(UTILISATION)
    expect(source).not.toContain('getUTCFullYear')
    expect(source).not.toContain('toISOString')
  })
})
