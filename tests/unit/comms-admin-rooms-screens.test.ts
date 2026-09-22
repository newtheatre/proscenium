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

describe('the backups screen says where a restore happens (J-107 criterion 6)', () => {
  test('it names who does one and where the steps are', async () => {
    const source = await read(BACKUPS)
    expect(source).toContain('data-test="where-restoring-happens"')
    expect(source).toContain('/docs/system/backups-and-restore')
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
