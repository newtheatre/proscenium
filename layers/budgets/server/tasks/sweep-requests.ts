// Daily: approved requests past their date lapse (BC-17), and decided ones past retention are anonymised.
import { defineTask } from '#kit'
import { daily } from '../requests'

export default defineTask(async (unit) => {
  await daily(unit)
})
