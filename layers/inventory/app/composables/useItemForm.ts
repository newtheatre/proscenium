// The add and edit form for an item (S3, INV-10, INV-11): its fields, what it starts from, and how
// its values become the request. Category comes first, naming the inspections it brings.
import type { ItemDetail, ItemOptions } from '../../shared/items'
import { CONDITIONS, OWNERSHIP } from '../../shared/states'

type Values = Record<string, unknown>
// The part of PageForm's field this form uses.
interface Field {
  name: string
  label: string
  kind: 'text' | 'textarea' | 'number' | 'money' | 'date' | 'select' | 'checkbox' | 'radio' | 'ticks'
  help?: string
  optional?: boolean
  options?: { value: string, label: string, description?: string }[]
  showIf?: (values: Values) => boolean
  section?: string
  pairWithNext?: boolean
}

export function useItemForm(options: Ref<ItemOptions | null | undefined>, item: ItemDetail | null) {
  const { t } = useT()
  const adding = !item
  const notOwned = (v: Values) => v.ownership !== 'owned'
  const department = (id: string) => options.value?.departments.find(d => d.id === id)?.name ?? ''

  const categoryOptions = computed(() => (options.value?.categories ?? []).map(c => ({
    value: c.id,
    label: [`${department(c.departmentId)} › ${c.name}`, c.kinds.length ? t('inventory.item-form.inspected', { kinds: c.kinds.join(', ') }) : null].filter(Boolean).join(' · '),
  })))
  const choice = (key: string, values: readonly string[]) => values.map(v => ({ value: v, label: t(`${key}.${v}`) }))

  const fields = computed<Field[]>(() => [
    { name: 'categoryId', label: t('inventory.item.category'), kind: 'select', options: categoryOptions.value, help: t('inventory.item-form.category-help') },
    { name: 'name', label: t('inventory.setup.name'), kind: 'text' },
    { name: 'tracking', label: t('inventory.item-form.tracking'), kind: 'radio', options: choice('inventory.tracking', ['individual', 'counted']).map(o => ({ ...o, description: t(`inventory.tracking-help.${o.value}`) })) },
    ...adding ? [{ name: 'count', label: t('inventory.item-form.count'), kind: 'number' as const, help: t('inventory.item-form.count-help'), showIf: (v: Values) => v.tracking === 'individual' }] : [],
    { name: 'quantity', label: t('inventory.item.quantity'), kind: 'number', showIf: (v: Values) => v.tracking === 'counted' },
    { name: 'homeLocationId', label: t('inventory.item.home'), kind: 'select', options: locationTree(options.value?.locations ?? []).map(r => ({ value: r.location.id, label: r.path })) },
    { name: 'condition', label: t('inventory.item.condition'), kind: 'select', options: choice('inventory.conditions', CONDITIONS) },
    { name: 'lendable', label: t('inventory.item-form.lendable'), kind: 'checkbox', help: t('inventory.item-form.lendable-help') },
    { name: 'description', label: t('inventory.item-form.description'), kind: 'textarea', optional: true },
    ...options.value?.tags.length ? [{ name: 'tags', label: t('inventory.item.tags'), kind: 'ticks' as const, optional: true, options: options.value.tags.map(x => ({ value: x.id, label: x.label })) }] : [],
    { name: 'make', label: t('inventory.item-form.make'), kind: 'text', optional: true, section: t('inventory.item-form.more'), pairWithNext: true },
    { name: 'model', label: t('inventory.item-form.model'), kind: 'text', optional: true },
    { name: 'serialNumber', label: t('inventory.item.serial'), kind: 'text', optional: true },
    { name: 'acquiredOn', label: t('inventory.item.acquired'), kind: 'date', optional: true },
    { name: 'replacementValue', label: t('inventory.item.value'), kind: 'money', optional: true },
    { name: 'ownership', label: t('inventory.item-form.ownership'), kind: 'radio', options: choice('inventory.ownership', OWNERSHIP) },
    { name: 'ownerName', label: t('inventory.item-form.owner'), kind: 'text', showIf: notOwned, pairWithNext: true },
    { name: 'ownerDueBackOn', label: t('inventory.item-form.due-back'), kind: 'date', showIf: notOwned },
  ])

  const initial: Values = item
    ? {
        categoryId: item.categoryId, name: item.name, tracking: item.tracking, count: 1, quantity: item.quantity, homeLocationId: item.homeLocationId,
        condition: item.condition, lendable: item.lendable, description: item.description ?? '', tags: item.tags.map(x => ({ value: x.id })),
        make: item.make ?? '', model: item.model ?? '', serialNumber: item.staff?.serialNumber ?? '', acquiredOn: item.acquiredOn,
        replacementValue: item.staff?.replacementValue ?? null, ownership: item.ownership, ownerName: item.staff?.ownerName ?? '', ownerDueBackOn: item.ownerDueBackOn,
      }
    : { categoryId: undefined, name: '', tracking: 'individual', count: 1, quantity: 1, homeLocationId: undefined, condition: 'good', lendable: true, description: '', tags: [], make: '', model: '', serialNumber: '', acquiredOn: null, replacementValue: null, ownership: 'owned', ownerName: '', ownerDueBackOn: null }

  // The form's values as the add or change route takes them.
  function body(v: Values) {
    const { categoryId, count, tags, ...rest } = v
    const tagIds = (tags as { value: string }[]).map(x => x.value)
    const requirements = item?.requirements ?? []
    return adding
      ? { categoryId: categoryId as string, request: { ...rest, tagIds, requirements, count: v.tracking === 'individual' ? count : 1 } }
      : { categoryId: categoryId as string, request: { ...rest, categoryId, tagIds, requirements } }
  }

  return { fields, initial, body }
}
