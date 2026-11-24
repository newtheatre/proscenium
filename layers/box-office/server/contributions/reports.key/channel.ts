// Where an order was made, as a report's breakdown and filter (REP-43).
import { wordsFrom } from '#kit'
import catalogue from '../../../i18n/en-GB.json'

const say = wordsFrom(catalogue)
const CHANNELS = ['online', 'desk', 'phone'] as const

export default {
  label: 'box-office.report-keys.channel',
  async values() {
    return CHANNELS.map(value => ({ value, label: say(`box-office.report-keys.channels.${value}`) }))
  },
}
