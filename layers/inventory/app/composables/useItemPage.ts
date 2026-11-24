// What the item page (S2) says: the facts that answer what it is, where it is, whether it is safe to
// lend and who has it, and its details, inspections and history in words.
import type { ItemDetail, ItemPage } from '../../shared/items'

export function useItemPage(page: Ref<ItemPage | null | undefined>) {
  const { t } = useT()
  const { day, dateTime } = useDates()
  const { money } = useMoneyText()

  const nextDue = (i: ItemDetail) => i.nextDueOn ? day(i.nextDueOn) : t('inventory.item.none-due')
  const summary = computed(() => {
    const i = page.value?.item
    if (!i) return []
    return [
      { label: t('inventory.item.department'), value: i.department },
      { label: t('inventory.item.category'), value: i.category },
      i.tracking === 'counted' ? { label: t('inventory.item.quantity'), value: String(i.quantity) } : { label: t('inventory.item.now-at'), value: i.location },
      { label: t('inventory.item.condition'), value: t(`inventory.conditions.${i.condition}`) },
      { label: t('inventory.item.next-due'), value: nextDue(i) },
      { label: t('inventory.item.loan'), value: t(i.onLoan ? 'inventory.item.on-loan' : i.lendable ? 'inventory.item.lendable' : 'inventory.item.not-lendable') },
    ]
  })

  const details = computed(() => {
    const i = page.value?.item
    if (!i) return []
    const staff = i.staff
    return [
      { label: t('inventory.item.tag'), value: i.tag },
      { label: t('inventory.item.home'), value: i.homeLocation },
      i.container ? { label: t('inventory.item.container'), value: i.container.tag, to: `/console/inventory/items/${i.container.id}` } : null,
      i.make || i.model ? { label: t('inventory.item.make-model'), value: [i.make, i.model].filter(Boolean).join(' ') } : null,
      i.acquiredOn ? { label: t('inventory.item.acquired'), value: day(i.acquiredOn) } : null,
      i.ownership === 'owned' ? null : { label: t(`inventory.ownership.${i.ownership}`), value: [staff?.ownerName, i.ownerDueBackOn ? t('inventory.item.goes-back', { date: day(i.ownerDueBackOn) }) : null].filter(Boolean).join(' · ') },
      staff?.serialNumber ? { label: t('inventory.item.serial'), value: staff.serialNumber } : null,
      staff && staff.replacementValue !== null ? { label: t('inventory.item.value'), value: money(staff.replacementValue, staff.currency) } : null,
      i.tags.length ? { label: t('inventory.item.tags'), value: i.tags.map(x => x.label).join(', ') } : null,
    ].filter(x => x !== null)
  })

  type Tone = 'danger' | 'warning' | 'success' | 'neutral'
  const dueTone = (on: string | null): Tone => !on || !page.value ? 'neutral' : on < page.value.today ? 'danger' : on <= page.value.dueBy ? 'warning' : 'success'
  const dues = computed(() => (page.value?.item.dues ?? []).map(d => ({
    ...d,
    when: d.applies ? (d.nextDueOn ? t('inventory.item.due-on', { date: day(d.nextDueOn) }) : t('inventory.item.none-due')) : t('inventory.item.no-longer-applies'),
    tone: d.applies ? dueTone(d.nextDueOn) : 'neutral' as Tone,
  })))

  const history = computed(() => (page.value?.item.history ?? []).map(h => ({
    id: h.id,
    what: t(`inventory.events.${h.kind}`),
    detail: [h.from && h.to ? t('inventory.item.from-to', { from: h.from, to: h.to }) : h.to, h.condition ? t(`inventory.conditions.${h.condition}`) : null].filter(Boolean).join(' · '),
    when: dateTime(h.at),
  })))

  return { summary, details, dues, history }
}
