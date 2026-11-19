<!-- A price list (S12): every size on sale with its price on this list beside Standard's, and where
     it follows Standard. Prices are set from each product's page, or raised together, with a preview
     of old and new. -->
<script setup lang="ts">
interface VariantPrice { listId: string, amountMinor: number | null, from: 'list' | 'standard' | null }
interface Variant { id: string, name: string, mixerMeasure: boolean, active: boolean, prices: VariantPrice[] }
interface Product { id: string, name: string, active: boolean, variants: Variant[] }
interface Category { id: string, name: string, active: boolean, products: Product[] }
interface List { id: string, name: string, standard: boolean, restricted: boolean, fallsBack: boolean, active: boolean }

const { t } = useT()
const route = useRoute()
const { $api } = useNuxtApp()
const { money } = await useMoney()
const { toRefusal, fieldErrors } = useRefusal()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<{ categories: Category[], lists: List[] }>('/api/bar/price-lists', { key: 'bar:price-lists' })
const list = computed(() => data.value?.lists.find(l => l.id === String(route.params.id)))
const standard = computed(() => data.value?.lists.find(l => l.standard))
const trail = computed(() => [{ label: t('bar.navigation.price-lists.label'), to: '/admin/modules/bar/price-lists' }])

// The mixer measure is priced by the Mixer choices, never on a list, so it is not shown.
const sizeName = (p: Product, v: Variant) => p.variants.filter(x => !x.mixerMeasure).length === 1 && v.name === 'Each' ? p.name : `${p.name}, ${v.name}`
function here(v: Variant): string {
  const p = v.prices.find(x => x.listId === list.value?.id)
  if (!p || p.amountMinor === null) return t('bar.screens.product.not-sold')
  if (p.from === 'standard') return t('bar.screens.lists.follows', { amount: money(p.amountMinor) })
  return money(p.amountMinor)
}
// Raising prices together: a percentage or an amount, every category or some, from now or later.
const raising = ref<{ by: 'percent' | 'amount', percent: number | null, amountMinor: number | null, categoryIds: string[], later: boolean, effectiveFrom: number | null } | null>(null)
const preview = ref<{ variantId: string, oldMinor: number, newMinor: number }[] | null>(null)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
type FormRef = { setErrors: (errors: FieldError[]) => void }
const raiseEl = useTemplateRef<FormRef>('raiseEl')
// What a raise needs: its percentage or amount, and its moment when it starts later.
const validateRaise = () => {
  const r = raising.value!
  return needs({ percent: r.by === 'percent' ? r.percent : true, amountMinor: r.by === 'amount' ? r.amountMinor : true, effectiveFrom: r.later ? r.effectiveFrom : true })
}
const names = computed(() => new Map((data.value?.categories ?? []).flatMap(c => c.products.flatMap(p => p.variants.map(v => [v.id, sizeName(p, v)] as const)))))
const categoryItems = computed(() => (data.value?.categories ?? []).filter(c => c.active).map(c => ({ value: c.id, label: c.name })))
const byItems = computed(() => [{ value: 'percent', label: t('bar.screens.lists.raise.by-percent') }, { value: 'amount', label: t('bar.screens.lists.raise.by-amount') }])
function startRaise() {
  refusal.value = null
  preview.value = null
  raising.value = { by: 'percent', percent: null, amountMinor: null, categoryIds: [], later: false, effectiveFrom: null }
}
const raiseBody = computed(() => {
  const r = raising.value
  if (!r) return null
  const how = r.by === 'percent' ? (r.percent ? { percent: r.percent } : null) : (r.amountMinor ? { amountMinor: r.amountMinor } : null)
  if (!how) return null
  return { ...how, ...(r.categoryIds.length ? { categoryIds: r.categoryIds } : {}), ...(r.later && r.effectiveFrom ? { effectiveFrom: r.effectiveFrom } : {}) }
})
async function send(previewOnly: boolean) {
  refusal.value = null
  try {
    const answer = await $api<{ rows: { variantId: string, oldMinor: number, newMinor: number }[] }>(`/api/bar/price-lists/${list.value!.id}/raise` as string, { method: 'POST', body: { ...raiseBody.value, preview: previewOnly } })
    if (previewOnly) {
      preview.value = answer.rows
      return
    }
    raising.value = null
    toast.add({ title: t('bar.screens.lists.raise.done', { count: answer.rows.length }), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
    raiseEl.value?.setErrors(fieldErrors(refusal.value))
  }
}
watch(raiseBody, () => {
  preview.value = null
}, { deep: true })

function onStandard(v: Variant): string {
  const p = v.prices.find(x => x.listId === standard.value?.id)
  return p?.amountMinor === null || p?.amountMinor === undefined ? t('bar.screens.product.not-sold') : money(p.amountMinor)
}
</script>

<template>
  <PageFrame
    :title="list?.name ?? t('bar.navigation.price-lists.label')"
    :trail="trail"
  >
    <template #primary>
      <UButton
        v-if="list && list.active"
        icon="i-lucide-trending-up"
        :label="t('bar.screens.lists.raise.title')"
        @click="startRaise()"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <div
        v-if="data && list"
        class="space-y-6"
      >
        <p class="text-sm text-muted">
          {{ list.standard ? t('bar.screens.lists.standard-help') : t('bar.screens.lists.hand-help') }}
        </p>
        <PageSection
          v-for="c in data.categories.filter(c => c.active)"
          :key="c.id"
          :title="c.name"
        >
          <RecordList :label="c.name">
            <template
              v-for="p in c.products.filter(p => p.active)"
              :key="p.id"
            >
              <RecordListItem
                v-for="v in p.variants.filter(v => v.active && !v.mixerMeasure)"
                :key="v.id"
                :to="`/admin/modules/bar/products/${p.id}`"
                :name="sizeName(p, v)"
                :description="list.standard ? here(v) : t('bar.screens.lists.beside-standard', { here: here(v), standard: onStandard(v) })"
              />
            </template>
          </RecordList>
        </PageSection>
      </div>
      <EmptyState
        v-else-if="data"
        :title="t('bar.screens.lists.unknown')"
        icon="i-lucide-tags"
      />
    </DataBoundary>

    <UModal
      :open="!!raising"
      :title="t('bar.screens.lists.raise.title')"
      :description="t('bar.screens.lists.raise.help')"
      @update:open="v => { if (!v) raising = null }"
    >
      <template #body>
        <UForm
          v-if="raising"
          id="bar-raise"
          ref="raiseEl"
          :state="raising"
          :validate="validateRaise"
          class="space-y-4"
          novalidate
          @submit="send(!preview)"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            :label="t('bar.screens.lists.raise.how')"
            name="by"
          >
            <USelect
              v-model="raising.by"
              :items="byItems"
            />
          </UFormField>
          <UFormField
            v-if="raising.by === 'percent'"
            :label="t('bar.screens.lists.raise.percent')"
            name="percent"
          >
            <UInputNumber
              v-model="raising.percent"
              :min="-90"
              :max="500"
              :step="0.5"
            />
          </UFormField>
          <UFormField
            v-else
            :label="t('bar.screens.lists.raise.amount')"
            name="amountMinor"
          >
            <FieldMoney v-model="raising.amountMinor" />
          </UFormField>
          <UFormField
            :label="t('bar.screens.lists.raise.categories')"
            :help="t('bar.screens.lists.raise.categories-help')"
            name="categoryIds"
          >
            <UCheckboxGroup
              v-model="raising.categoryIds"
              :items="categoryItems"
            />
          </UFormField>
          <UCheckbox
            v-model="raising.later"
            :label="t('bar.screens.product.later')"
          />
          <UFormField
            v-if="raising.later"
            :label="t('bar.screens.product.from')"
            name="effectiveFrom"
            required
          >
            <FieldDateTime
              v-model="raising.effectiveFrom"
              :min="Date.now()"
            />
          </UFormField>
          <template v-if="preview">
            <p
              v-if="!preview.length"
              class="text-sm text-muted"
            >
              {{ t('bar.screens.lists.raise.nothing') }}
            </p>
            <RecordList
              v-else
              :label="t('bar.screens.lists.raise.preview')"
            >
              <RecordListItem
                v-for="r in preview"
                :key="r.variantId"
                :name="names.get(r.variantId) ?? ''"
                :description="t('bar.screens.lists.raise.old-new', { old: money(r.oldMinor), new: money(r.newMinor) })"
              />
            </RecordList>
          </template>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="bar-raise"
          :disabled="preview !== null && !preview.length"
          :label="preview ? t('bar.screens.lists.raise.save', { count: preview.length }) : t('bar.screens.lists.raise.show-preview')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
