// Your companies (CO-08): the contact's engagements and how what they owe is worded.
import type { MyEngagement, ToDo } from '../../shared/views'

export async function useMyCompanies() {
  const { t } = useT()
  const dates = useDates()
  const fetched = await useAPI<{ engagements: MyEngagement[] }>('/api/companies/mine', { key: 'companies:mine' })
  const toDoWords = (item: ToDo) => item.kind === 'name-guests'
    ? t('companies.mine.name-guests', { count: item.count, when: item.due ? dates.dateTime(item.due) : '' })
    : t(`companies.mine.${item.kind}`)
  const datesOf = (e: MyEngagement) => e.firstDate
    ? (e.lastDate && e.lastDate !== e.firstDate ? dates.range(e.firstDate, e.lastDate) : dates.day(e.firstDate))
    : t('companies.mine.no-dates')
  return { ...fetched, toDoWords, datesOf }
}
