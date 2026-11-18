<!-- Products (S11): the bar's categories, in till order, each with its products and their Standard
     prices. A product opens its own page for its sizes and prices on every list. Products move up and
     down within their category by button, so the keyboard can reorder them too. -->
<script setup lang="ts">
import { categoryInput } from '../../../../../../server/input'

interface VariantPrice { listId: string, amountMinor: number | null }
interface Variant { id: string, name: string, mixerMeasure: boolean, active: boolean, prices: VariantPrice[] }
interface Product { id: string, name: string, ageRestricted: boolean, active: boolean, variants: Variant[] }
interface Category { id: string, name: string, colour: string | null, parentId: string | null, ageRestricted: boolean, usualPreset: string | null, active: boolean, products: Product[] }
interface List { id: string, name: string, standard: boolean, percentOff: number | null, active: boolean }

const { t } = useT()
const { $api } = useNuxtApp()
const { money } = await useMoney()
const { toRefusal, fieldErrors } = useRefusal()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<{ categories: Category[], lists: List[] }>('/api/bar/catalogue', { key: 'bar:catalogue' })

const standard = computed(() => data.value?.lists.find(l => l.standard)?.id)
const COLOURS = ['primary', 'secondary', 'success', 'info', 'warning', 'error', 'neutral'] as const
const colourItems = computed(() => [{ value: 'none', label: t('bar.screens.products.colour-none') }, ...COLOURS.map(c => ({ value: c, label: t(`bar.screens.colours.${c}`) }))])

// Each top-level category followed by its sub-categories, which are titled with the parent's name.
const ordered = computed(() => {
  const all = data.value?.categories ?? []
  const nameOf = (id: string) => all.find(c => c.id === id)?.name ?? ''
  return all.filter(c => !c.parentId || !all.some(p => p.id === c.parentId)).flatMap(top => [
    { ...top, title: top.name },
    ...all.filter(c => c.parentId === top.id).map(c => ({ ...c, title: t('bar.screens.products.sub-title', { parent: nameOf(top.id), name: c.name }) })),
  ])
})

// One line of a product: each size on sale with its Standard price.
function line(p: Product): string {
  const sizes = p.variants.filter(v => v.active).map((v) => {
    const price = v.prices.find(x => x.listId === standard.value)?.amountMinor
    const shown = price === null || price === undefined ? t('bar.screens.products.no-price') : money(price)
    return p.variants.length === 1 && v.name === 'Each' ? shown : `${v.name} ${shown}`
  })
  return [sizes.join(' · '), p.ageRestricted ? t('bar.screens.products.age-restricted') : null].filter(Boolean).join(' · ')
}
// A size on sale with no Standard price is not on the till yet. The mixer measure is priced by its group.
const needsPrice = (p: Product) => p.active && p.variants.some(v => v.active && !v.mixerMeasure && (v.prices.find(x => x.listId === standard.value)?.amountMinor ?? null) === null)

// A category: new, or renamed, recoloured or retired.
const category = ref<{ id: string | null, name: string, colour: string, parentId: string, ageRestricted: boolean, usualPreset: string } | null>(null)
const presets = ref<{ id: string, builtIn: boolean, name: string | null }[]>([])
const presetLabel = (id: string) => {
  const p = presets.value.find(x => x.id === id)
  return !p ? '' : p.builtIn ? t(`bar.presets.${p.id.slice('builtin:'.length)}.name`) : p.name!
}
// A sub-category with no usual preset of its own takes its parent's, which "none" then names.
const presetItems = computed(() => {
  const parent = data.value?.categories.find(c => c.id === category.value?.parentId)
  const none = parent?.usualPreset ? t('bar.screens.products.preset-as-parent', { parent: parent.name, preset: presetLabel(parent.usualPreset) }) : t('bar.screens.products.preset-none')
  return [{ value: 'none', label: none }, ...presets.value.map(p => ({ value: p.id, label: presetLabel(p.id) }))]
})
// A sub-category sits under a top-level category in use; one with sub-categories of its own stays top-level.
const parentItems = computed(() => {
  const all = data.value?.categories ?? []
  const self = category.value?.id
  const hasChildren = !!self && all.some(c => c.parentId === self)
  const tops = hasChildren ? [] : all.filter(c => c.active && !c.parentId && c.id !== self)
  return [{ value: 'none', label: t('bar.screens.products.parent-none') }, ...tops.map(c => ({ value: c.id, label: c.name }))]
})
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const categoryEl = useTemplateRef<{ setErrors: (errors: FieldError[]) => void }>('categoryEl')
async function editCategory(c?: Category) {
  refusal.value = null
  presets.value = (await $api<{ presets: { id: string, builtIn: boolean, name: string | null }[] }>('/api/bar/presets')).presets
  category.value = c
    ? { id: c.id, name: c.name, colour: c.colour ?? 'none', parentId: c.parentId ?? 'none', ageRestricted: c.ageRestricted, usualPreset: c.usualPreset ?? 'none' }
    : { id: null, name: '', colour: 'none', parentId: 'none', ageRestricted: false, usualPreset: 'none' }
}
const categoryBody = () => {
  const c = category.value!
  return { name: c.name, colour: c.colour === 'none' ? null : c.colour, parentId: c.parentId === 'none' ? null : c.parentId, ageRestricted: c.ageRestricted, usualPreset: c.usualPreset === 'none' ? null : c.usualPreset }
}
async function saveCategory() {
  const c = category.value!
  refusal.value = null
  try {
    const body = categoryBody()
    if (c.id) await $api(`/api/bar/categories/${c.id}` as string, { method: 'PATCH', body })
    else await $api('/api/bar/categories', { method: 'POST', body })
    toast.add({ title: t('bar.screens.products.category-saved'), color: 'success' })
    category.value = null
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
    categoryEl.value?.setErrors(fieldErrors(refusal.value))
  }
}
async function setCategoryActive(c: Category, active: boolean) {
  try {
    await $api(`/api/bar/categories/${c.id}` as string, { method: 'PATCH', body: { active } })
    await refresh()
  }
  catch (e) {
    toast.add({ title: toRefusal(e).reason, color: 'error' })
  }
}

// A new product: the two-step window, opened on a category's usual preset when it has one.
const adding = ref(false)
const addingTo = ref<string | undefined>()
const categoryItems = computed(() => (data.value?.categories ?? []).filter(c => c.active).map(c => ({ value: c.id, label: c.name })))
function newProduct(c?: Category) {
  addingTo.value = c?.id
  adding.value = true
}

async function move(p: Product, direction: 'up' | 'down') {
  try {
    await $api(`/api/bar/products/${p.id}/move` as string, { method: 'POST', body: { direction } })
    await refresh()
  }
  catch (e) {
    toast.add({ title: toRefusal(e).reason, color: 'error' })
  }
}
</script>

<template>
  <PageFrame :title="t('bar.navigation.products.label')">
    <template #primary>
      <UButton
        icon="i-lucide-plus"
        :label="t('bar.screens.products.new-product')"
        :disabled="!categoryItems.length"
        @click="newProduct()"
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
          v-if="!data.categories.length"
          icon="i-lucide-beer"
          :title="t('bar.screens.products.empty-title')"
          :description="t('bar.screens.products.empty')"
        >
          <template #actions>
            <UButton
              :label="t('bar.screens.products.new-category')"
              icon="i-lucide-plus"
              @click="editCategory()"
            />
          </template>
        </EmptyState>
        <PageSection
          v-for="c in ordered"
          :key="c.id"
          :title="c.title"
          :description="c.active ? undefined : t('bar.screens.products.category-retired')"
        >
          <template #actions>
            <UBadge
              v-if="c.colour"
              :color="c.colour as any"
              variant="subtle"
              :label="t(`bar.screens.colours.${c.colour}`)"
            />
            <UButton
              v-if="c.active"
              color="neutral"
              variant="outline"
              icon="i-lucide-plus"
              :label="t('bar.screens.products.add-here')"
              @click="newProduct(c)"
            />
            <RowActions
              :label="t('bar.screens.products.category-actions', { name: c.name })"
              :items="[
                { label: t('bar.screens.products.edit-category'), icon: 'i-lucide-pencil', onSelect: () => editCategory(c) },
                c.active
                  ? { label: t('bar.screens.products.retire-category'), icon: 'i-lucide-archive', onSelect: () => setCategoryActive(c, false) }
                  : { label: t('bar.screens.products.restore-category'), icon: 'i-lucide-archive-restore', onSelect: () => setCategoryActive(c, true) },
              ]"
            />
          </template>
          <p
            v-if="!c.products.length"
            class="text-sm text-muted"
          >
            {{ t('bar.screens.products.no-products') }}
          </p>
          <RecordList
            v-else
            :label="c.name"
          >
            <RecordListItem
              v-for="(p, i) in c.products"
              :key="p.id"
              :description="line(p)"
              :muted="!p.active"
            >
              <template #name>
                <ULink :to="`/admin/modules/bar/products/${p.id}`">
                  {{ p.active ? p.name : t('bar.screens.products.retired-name', { name: p.name }) }}
                </ULink>
              </template>
              <StatusBadge
                v-if="needsPrice(p)"
                tone="warning"
                :label="t('bar.screens.products.needs-price')"
              />
              <div class="flex gap-1">
                <IconButton
                  icon="i-lucide-arrow-up"
                  :label="t('bar.screens.products.move-up', { name: p.name })"
                  :disabled="i === 0"
                  @click="move(p, 'up')"
                />
                <IconButton
                  icon="i-lucide-arrow-down"
                  :label="t('bar.screens.products.move-down', { name: p.name })"
                  :disabled="i === c.products.length - 1"
                  @click="move(p, 'down')"
                />
              </div>
            </RecordListItem>
          </RecordList>
        </PageSection>
        <UButton
          v-if="data.categories.length"
          color="neutral"
          variant="outline"
          icon="i-lucide-plus"
          :label="t('bar.screens.products.new-category')"
          @click="editCategory()"
        />
      </div>
    </DataBoundary>

    <UModal
      :open="!!category"
      :title="category?.id ? t('bar.screens.products.edit-category') : t('bar.screens.products.new-category')"
      @update:open="v => { if (!v) category = null }"
    >
      <template #body>
        <UForm
          v-if="category"
          id="bar-category"
          ref="categoryEl"
          :state="category"
          :validate="() => bodyErrors(categoryInput, categoryBody())"
          class="space-y-4"
          novalidate
          @submit="saveCategory"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            :label="t('bar.screens.products.category-name')"
            name="name"
            required
          >
            <UInput v-model="category.name" />
          </UFormField>
          <UFormField
            :label="t('bar.screens.products.colour')"
            :help="t('bar.screens.products.colour-help')"
            name="colour"
          >
            <USelect
              v-model="category.colour"
              :items="colourItems"
            />
          </UFormField>
          <UFormField
            :label="t('bar.screens.products.parent')"
            :help="t('bar.screens.products.parent-help')"
            name="parentId"
          >
            <USelect
              v-model="category.parentId"
              :items="parentItems"
            />
          </UFormField>
          <UCheckbox
            v-model="category.ageRestricted"
            :label="t('bar.screens.products.category-age')"
            :description="t('bar.screens.products.category-age-help')"
          />
          <UFormField
            :label="t('bar.screens.products.usual-preset')"
            :help="t('bar.screens.products.usual-preset-help')"
            name="usualPreset"
          >
            <USelect
              v-model="category.usualPreset"
              :items="presetItems"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="bar-category"
          loading-auto
          :label="t('bar.screens.save')"
        />
      </template>
    </UModal>

    <BarAddProduct
      v-if="data"
      v-model:open="adding"
      :category-id="addingTo"
      :categories="data.categories"
      :lists="data.lists"
      @added="id => navigateTo(`/admin/modules/bar/products/${id}`)"
      @presets="refresh()"
    />
  </PageFrame>
</template>
