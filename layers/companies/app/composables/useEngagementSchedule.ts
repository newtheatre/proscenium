import type { CallRow, PersonRow, Schedule } from '../../shared/views'

/** An engagement's calls and people (CO-23, CO-24), removing one behind a confirm. */
export async function useEngagementSchedule(engagementId: () => string) {
  const { t } = useT()
  const { $api } = useNuxtApp()
  const { confirm } = useConfirm()
  const { toRefusal } = useRefusal()
  const toast = useToast()
  const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
  const warnings = ref<string[]>([])
  const fetched = await useAPI<Schedule>(() => `/api/companies/engagements/${engagementId()}/schedule`, { key: `companies:schedule:${engagementId()}` })

  async function remove(path: string, words: { thing: string, done: string, consequence: string }) {
    if (!await confirm({ verb: t('companies.schedule.remove'), thing: words.thing, consequence: words.consequence, button: t('companies.schedule.remove') })) return
    refusal.value = null
    try {
      await $api(`/api/companies/engagements/${engagementId()}/${path}` as string, { method: 'DELETE', body: {} })
      await fetched.refresh()
      toast.add({ title: words.done, color: 'success' })
    }
    catch (e) {
      refusal.value = toRefusal(e)
    }
  }

  return {
    ...fetched,
    refusal,
    warnings,
    removeCall: (c: CallRow, name: string) => remove(`calls/${c.id}`, { thing: name, done: t('companies.calls.removed', { name }), consequence: t('companies.calls.remove-consequence') }),
    removePerson: (p: PersonRow) => remove(`people/${p.id}`, { thing: p.name, done: t('companies.people.removed', { name: p.name }), consequence: t('companies.people.remove-consequence') }),
  }
}
