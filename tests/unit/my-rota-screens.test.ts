import { describe, expect, test } from 'bun:test'

// Issue 1335, read as source: My rota lists what a member can take and a card per locked role,
// and every place a module meets a member offers the one derived action, on a phone as well.

const read = (path: string): Promise<string> => Bun.file(path).text()

const ROTA = 'app/pages/rota/index.vue'
const MY_TRAINING = 'app/pages/training/index.vue'
const MODULE = 'app/pages/training/modules/[id].vue'
const CARD = 'app/components/training/ModuleCard.vue'

describe('My rota (E-103 criterion 2 as trimmed)', () => {
  test('lists the shifts you can take, and a card for each role you could take', async () => {
    const source = await read(ROTA)
    expect(source).toContain('data-test="shifts-you-can-take"')
    expect(source).toContain('data-test="roles-you-could-take"')
    expect(source).toContain('claimable: \'true\'')
    expect(source).toContain('/api/rota/roles')
  })

  test('no locked row is drawn: a locked role is said once, on its card', async () => {
    expect(await read(ROTA)).not.toContain('\'Locked\'')
  })

  test('shifts are grouped by night and chosen by week', async () => {
    const source = await read(ROTA)
    expect(source).toContain('byNight(')
    expect(source).toContain('ROTA_WEEKS')
  })

  test('Claim is a 48px target', async () => {
    expect(await read(ROTA)).toMatch(/data-test="`claim-\$\{shift\.shiftId\}`"[\s\S]{0,200}min-h-12|min-h-12[\s\S]{0,200}data-test="`claim-\$\{shift\.shiftId\}`"/)
  })
})

describe('one derived action wherever a module meets a member (G-102 c6, G-129 c2)', () => {
  test('My training, the catalogue card and the module page all render it', async () => {
    for (const path of [MY_TRAINING, CARD, MODULE]) {
      expect(await read(path)).toContain('<TrainingModuleAction')
    }
  })

  test('the module page shows it below the large breakpoint too, not only in the aside', async () => {
    expect(await read(MODULE)).toMatch(/lg:hidden[\s\S]{0,300}<TrainingModuleAction/)
  })
})
