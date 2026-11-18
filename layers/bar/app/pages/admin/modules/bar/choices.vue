<!-- Choices (Bar specification, tab 10): shared groups such as Spirit, Mixer or Milk, set up once and
     attached to any number of products on each product's page. A Mixer group lists every drink ticked
     "Can be used as a mixer" by itself; the others list their own options, each with what it adds to
     the price, whether it needs an age check, and its allergens. -->
<script setup lang="ts">
type Source = 'options' | 'mixers'
type Pricing = 'included' | 'fixed' | 'own_price'
interface Option { key: string, label: string, deltaMinor: number, ageRestricted: boolean, optionId: string | null }
interface Group { id: string, name: string, source: Source, required: boolean, maxPicks: number, defaultKey: string | null, mixerPricing: Pricing | null, mixerFixedMinor: number | null, active: boolean, options: Option[] }
interface Answer { contains: string[], mayContain: string[], checked: boolean }

const ALLERGENS = ['gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soya', 'milk', 'nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs'] as const

const { t } = useT()
const { $api } = useNuxtApp()
const { money } = await useMoney()
const { toRefusal } = useRefusal()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<{ groups: Group[], canAllergens: boolean, allergens: Record<string, Answer>, allergensFromStock: string[], canStock: boolean, stockItems: { id: string, name: string }[], stockOf: Record<string, string> }>('/api/bar/choices', { key: 'bar:choices' })

const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const sourceItems = computed(() => (['options', 'mixers'] as const).map(s => ({ value: s, label: t(`bar.screens.choices.sources.${s}`), description: t(`bar.screens.choices.sources.${s}-help`) })))
const pricingItems = computed(() => (['included', 'fixed', 'own_price'] as const).map(p => ({ value: p, label: t(`bar.screens.choices.pricing.${p}`) })))
const named = (keys: string[]) => keys.map(k => t(`bar.allergen.${k}`)).join(', ')

function describeGroup(g: Group): string {
  const how = g.required ? t('bar.screens.choices.required') : t('bar.screens.choices.optional')
  const picks = g.maxPicks > 1 ? t('bar.screens.choices.up-to', { count: g.maxPicks }) : null
  const usual = g.options.find(o => o.key === g.defaultKey)?.label
  const pricing = g.source === 'mixers' && g.mixerPricing
    ? g.mixerPricing === 'fixed' ? t('bar.screens.choices.pricing-fixed', { amount: money(g.mixerFixedMinor ?? 0) }) : t(`bar.screens.choices.pricing.${g.mixerPricing}`)
    : null
  return [how, picks, usual ? t('bar.screens.choices.usual', { name: usual }) : null, pricing].filter(Boolean).join(' · ')
}
function describeOption(o: Option): string {
  const parts = [o.deltaMinor ? t('bar.screens.choices.adds', { amount: money(o.deltaMinor) }) : null, o.ageRestricted ? t('bar.screens.products.age-restricted') : null]
  if (data.value?.canAllergens && o.optionId) {
    const a = data.value.allergens[o.optionId]
    parts.push(!a
      ? t('bar.screens.product.allergens-unchecked')
      : a.contains.length || a.mayContain.length
        ? [a.contains.length ? `${t('bar.screens.product.contains')}: ${named(a.contains)}` : null, a.mayContain.length ? `${t('bar.screens.product.may-contain')}: ${named(a.mayContain)}` : null].filter(Boolean).join(' · ')
        : t('bar.screens.product.none-listed'))
    if (data.value.allergensFromStock.includes(o.optionId)) parts.push(t('bar.screens.choices.allergens-from-stock'))
  }
  return parts.filter(Boolean).join(' · ')
}

// A group: new, or changed. The kind of list is fixed once made.
const group = ref<{ id: string | null, name: string, source: Source, required: boolean, maxPicks: number, defaultKey: string, mixerPricing: Pricing, mixerFixedMinor: number | null, options: Option[] } | null>(null)
function editGroup(g?: Group) {
  refusal.value = null
  group.value = g
    ? { id: g.id, name: g.name, source: g.source, required: g.required, maxPicks: g.maxPicks, defaultKey: g.defaultKey ?? 'none', mixerPricing: g.mixerPricing ?? 'included', mixerFixedMinor: g.mixerFixedMinor, options: g.options }
    : { id: null, name: '', source: 'options', required: true, maxPicks: 1, defaultKey: 'none', mixerPricing: 'included', mixerFixedMinor: null, options: [] }
}
const defaultItems = computed(() => [{ value: 'none', label: t('bar.screens.choices.no-usual') }, ...(group.value?.options ?? []).map(o => ({ value: o.key, label: o.label }))])
async function saveGroup() {
  const g = group.value!
  refusal.value = null
  const mixer = g.source === 'mixers' ? { mixerPricing: g.mixerPricing, mixerFixedMinor: g.mixerPricing === 'fixed' ? g.mixerFixedMinor : null } : {}
  const body = { name: g.name, required: g.required, maxPicks: g.maxPicks, ...mixer }
  try {
    if (g.id) await $api(`/api/bar/choices/${g.id}` as string, { method: 'PATCH', body: { ...body, defaultKey: g.defaultKey === 'none' ? null : g.defaultKey } })
    else await $api('/api/bar/choices', { method: 'POST', body: { ...body, source: g.source } })
    toast.add({ title: t('bar.screens.choices.saved'), color: 'success' })
    group.value = null
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
async function setGroupActive(g: Group, active: boolean) {
  try {
    await $api(`/api/bar/choices/${g.id}` as string, { method: 'PATCH', body: { active } })
    await refresh()
  }
  catch (e) {
    toast.add({ title: toRefusal(e).reason, color: 'error' })
  }
}

// An option of a hand-listed group.
const option = ref<{ groupId: string, id: string | null, name: string, deltaMinor: number | null, ageRestricted: boolean, stockItemId: string } | null>(null)
const stockItems = computed(() => [{ value: 'none', label: t('bar.screens.choices.no-stock') }, ...(data.value?.stockItems ?? []).map(i => ({ value: i.id, label: i.name }))])
function editOption(g: Group, o?: Option) {
  refusal.value = null
  option.value = o
    ? { groupId: g.id, id: o.optionId, name: o.label, deltaMinor: o.deltaMinor, ageRestricted: o.ageRestricted, stockItemId: data.value?.stockOf[o.optionId!] ?? 'none' }
    : { groupId: g.id, id: null, name: '', deltaMinor: null, ageRestricted: false, stockItemId: 'none' }
}
async function saveOption() {
  const o = option.value!
  refusal.value = null
  const body = { name: o.name, deltaMinor: o.deltaMinor ?? 0, ageRestricted: o.ageRestricted, ...(data.value?.canStock ? { stockItemId: o.stockItemId === 'none' ? null : o.stockItemId } : {}) }
  try {
    if (o.id) await $api(`/api/bar/choice-options/${o.id}` as string, { method: 'PATCH', body })
    else await $api(`/api/bar/choices/${o.groupId}/options` as string, { method: 'POST', body })
    toast.add({ title: t('bar.screens.choices.option-saved'), color: 'success' })
    option.value = null
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
async function retireOption(o: Option) {
  try {
    await $api(`/api/bar/choice-options/${o.optionId}` as string, { method: 'PATCH', body: { active: false } })
    await refresh()
  }
  catch (e) {
    toast.add({ title: toRefusal(e).reason, color: 'error' })
  }
}

// An option's allergens, from its label: what it brings to the drink it is picked for.
const allergenItems = computed(() => ALLERGENS.map(k => ({ value: k as string, label: t(`bar.allergen.${k}`) })))
const sourceOfCheck = computed(() => (['label', 'supplier', 'other'] as const).map(s => ({ value: s, label: t(`bar.screens.product.sources.${s}`) })))
const label = ref<{ optionId: string, name: string, contains: string[], mayContain: string[], source: 'label' | 'supplier' | 'other' } | null>(null)
function editAllergens(o: Option) {
  const a = data.value?.allergens[o.optionId!]
  refusal.value = null
  label.value = { optionId: o.optionId!, name: o.label, contains: [...a?.contains ?? []], mayContain: [...a?.mayContain ?? []], source: 'label' }
}
async function saveAllergens() {
  const l = label.value!
  refusal.value = null
  try {
    await $api(`/api/bar/choice-options/${l.optionId}/allergens` as string, { method: 'POST', body: { contains: l.contains, mayContain: l.mayContain.filter(k => !l.contains.includes(k)), source: l.source } })
    toast.add({ title: t('bar.screens.product.allergens-saved'), color: 'success' })
    label.value = null
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
</script>

<template>
  <PageFrame :title="t('bar.navigation.choices.label')">
    <template #primary>
      <UButton
        icon="i-lucide-plus"
        :label="t('bar.screens.choices.new')"
        @click="editGroup()"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <div
        v-if="data"
        class="space-y-6"
      >
        <EmptyState
          v-if="!data.groups.length"
          icon="i-lucide-list-checks"
          :title="t('bar.screens.choices.empty-title')"
          :description="t('bar.screens.choices.empty')"
        />
        <PageSection
          v-for="g in data.groups"
          :key="g.id"
          :title="g.active ? g.name : t('bar.screens.products.retired-name', { name: g.name })"
          :description="describeGroup(g)"
        >
          <template #actions>
            <UButton
              v-if="g.active && g.source === 'options'"
              color="neutral"
              variant="outline"
              icon="i-lucide-plus"
              :label="t('bar.screens.choices.add-option')"
              @click="editOption(g)"
            />
            <RowActions
              :label="t('bar.screens.choices.actions', { name: g.name })"
              :items="[
                { label: t('bar.screens.choices.edit'), icon: 'i-lucide-pencil', onSelect: () => editGroup(g) },
                g.active
                  ? { label: t('bar.screens.choices.retire'), icon: 'i-lucide-archive', onSelect: () => setGroupActive(g, false) }
                  : { label: t('bar.screens.choices.restore'), icon: 'i-lucide-archive-restore', onSelect: () => setGroupActive(g, true) },
              ]"
            />
          </template>
          <p
            v-if="!g.options.length"
            class="text-sm text-muted"
          >
            {{ g.source === 'mixers' ? t('bar.screens.choices.no-mixers') : t('bar.screens.choices.no-options') }}
          </p>
          <RecordList
            v-else
            :label="g.name"
          >
            <RecordListItem
              v-for="o in g.options"
              :key="o.key"
              :name="o.label"
              :description="describeOption(o)"
            >
              <RowActions
                v-if="o.optionId"
                :label="t('bar.screens.choices.option-actions', { name: o.label })"
                :items="[
                  { label: t('bar.screens.choices.edit-option'), icon: 'i-lucide-pencil', onSelect: () => editOption(g, o) },
                  ...(data.canAllergens && !data.allergensFromStock.includes(o.optionId!) ? [{ label: t('bar.screens.product.check-label'), icon: 'i-lucide-clipboard-check', onSelect: () => editAllergens(o) }] : []),
                  { label: t('bar.screens.choices.retire-option'), icon: 'i-lucide-archive', onSelect: () => retireOption(o) },
                ]"
              />
            </RecordListItem>
          </RecordList>
        </PageSection>
      </div>
    </DataBoundary>

    <UModal
      :open="!!group"
      :title="group?.id ? t('bar.screens.choices.edit') : t('bar.screens.choices.new')"
      @update:open="v => { if (!v) group = null }"
    >
      <template #body>
        <UForm
          v-if="group"
          id="bar-choice"
          novalidate
          :state="group"
          class="space-y-4"
          @submit="saveGroup"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            :label="t('bar.screens.choices.name')"
            :help="t('bar.screens.choices.name-help')"
            name="name"
            required
          >
            <UInput v-model="group.name" />
          </UFormField>
          <UFormField
            v-if="!group.id"
            :label="t('bar.screens.choices.source')"
            name="source"
          >
            <URadioGroup
              v-model="group.source"
              :items="sourceItems"
            />
          </UFormField>
          <UCheckbox
            v-model="group.required"
            :label="t('bar.screens.choices.required-tick')"
            :description="t('bar.screens.choices.required-help')"
          />
          <UFormField
            :label="t('bar.screens.choices.max-picks')"
            :help="t('bar.screens.choices.max-picks-help')"
            name="maxPicks"
          >
            <UInputNumber
              v-model="group.maxPicks"
              :min="1"
              :max="10"
            />
          </UFormField>
          <UFormField
            v-if="group.id && group.options.length"
            :label="t('bar.screens.choices.default')"
            :help="t('bar.screens.choices.default-help')"
            name="defaultKey"
          >
            <USelectMenu
              v-model="group.defaultKey"
              :items="defaultItems"
              value-key="value"
            />
          </UFormField>
          <template v-if="group.source === 'mixers'">
            <UFormField
              :label="t('bar.screens.choices.mixer-price')"
              name="mixerPricing"
            >
              <USelect
                v-model="group.mixerPricing"
                :items="pricingItems"
              />
            </UFormField>
            <UFormField
              v-if="group.mixerPricing === 'fixed'"
              :label="t('bar.screens.choices.fixed-amount')"
              name="mixerFixedMinor"
              required
            >
              <FieldMoney v-model="group.mixerFixedMinor" />
            </UFormField>
          </template>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="bar-choice"
          :label="t('bar.screens.save')"
        />
      </template>
    </UModal>

    <UModal
      :open="!!option"
      :title="option?.id ? t('bar.screens.choices.edit-option') : t('bar.screens.choices.add-option')"
      @update:open="v => { if (!v) option = null }"
    >
      <template #body>
        <UForm
          v-if="option"
          id="bar-choice-option"
          novalidate
          :state="option"
          class="space-y-4"
          @submit="saveOption"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            :label="t('bar.screens.choices.option-name')"
            name="name"
            required
          >
            <UInput v-model="option.name" />
          </UFormField>
          <UFormField
            :label="t('bar.screens.choices.delta')"
            :help="t('bar.screens.choices.delta-help')"
            name="deltaMinor"
          >
            <FieldMoney v-model="option.deltaMinor" />
          </UFormField>
          <UCheckbox
            v-model="option.ageRestricted"
            :label="t('bar.screens.products.age-check')"
            :description="t('bar.screens.choices.option-age-help')"
          />
          <UFormField
            v-if="data?.canStock"
            :label="t('bar.screens.choices.stock-item')"
            :help="t('bar.screens.choices.stock-item-help')"
            name="stockItemId"
          >
            <USelectMenu
              v-model="option.stockItemId"
              :items="stockItems"
              value-key="value"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="bar-choice-option"
          :label="t('bar.screens.save')"
        />
      </template>
    </UModal>

    <UModal
      :open="!!label"
      :title="label ? t('bar.screens.choices.allergens-of', { name: label.name }) : ''"
      @update:open="v => { if (!v) label = null }"
    >
      <template #body>
        <UForm
          v-if="label"
          id="bar-option-allergens"
          novalidate
          :state="label"
          class="space-y-4"
          @submit="saveAllergens"
        >
          <RefusalNotice :refusal="refusal" />
          <p class="text-sm text-muted">
            {{ t('bar.screens.choices.allergens-help') }}
          </p>
          <UFormField name="contains">
            <UCheckboxGroup
              v-model="label.contains"
              :legend="t('bar.screens.product.contains')"
              :items="allergenItems"
              class="columns-2"
            />
          </UFormField>
          <UFormField
            :help="t('bar.screens.product.may-contain-help')"
            name="mayContain"
          >
            <UCheckboxGroup
              v-model="label.mayContain"
              :legend="t('bar.screens.product.may-contain')"
              :items="allergenItems.filter(i => !label!.contains.includes(i.value))"
              class="columns-2"
            />
          </UFormField>
          <UFormField
            :label="t('bar.screens.product.source')"
            name="source"
          >
            <USelect
              v-model="label.source"
              :items="sourceOfCheck"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="bar-option-allergens"
          :label="t('bar.screens.product.allergens-record')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
