<!-- Products (S11): the bar's categories, in till order, each with its products and their Standard
     prices. A product opens its own page for its sizes and prices on every list. Products are put in
     order within their category by dragging, or from the keyboard and the row's menu. Retired categories
     sit below a divider; the search finds a category or a product by name. The allergens home card
     opens it with ?allergens=unchecked, showing only products with a size whose labels are not checked. -->
<script setup lang="ts">
import { categoryInput } from '../../../../../../server/input'

interface Variant { id: string, name: string, mixerMeasure: boolean, active: boolean, prices: { listId: string, amountMinor: number | null }[] }
interface Product { id: string, name: string, ageRestricted: boolean, active: boolean, variants: Variant[] }
interface Category { id: string, name: string, colour: string | null, parentId: string | null, ageRestricted: boolean, usualPreset: string | null, active: boolean, products: Product[] }
interface List { id: string, name: string, standard: boolean, active: boolean }
type Section = Category & { title: string }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const toast = useToast()
const { offer } = useUndo()
const { data, status, error, refresh } = await useAPI<{ categories: Category[], lists: List[] }>('/api/bar/catalogue', { key: 'bar:catalogue' })

const standard = computed(() => data.value?.lists.find(l => l.standard)?.id)
const COLOURS = ['primary', 'secondary', 'success', 'info', 'warning', 'error', 'neutral'] as const
// Each colour with a swatch of itself beside its plain name.
const colourItems = computed(() => [{ value: 'none', label: t('bar.screens.products.colour-none') }, ...COLOURS.map(c => ({ value: c, label: t(`bar.screens.colours.${c}`), chip: { color: c } }))])

const route = useRoute()
const uncheckedOnly = computed(() => route.query.allergens === 'unchecked')
const { data: unchecked, execute: loadUnchecked } = await useAPI<{ sizes: { variantId: string, productId: string }[] }>('/api/bar/allergens/unchecked', { key: 'bar:allergens-unchecked', immediate: uncheckedOnly.value, watch: false })
watch(uncheckedOnly, on => on && loadUnchecked())
const uncheckedProducts = computed(() => new Set((unchecked.value?.sizes ?? []).map(s => s.productId)))
const query = ref('')
const searching = ref(false)
const filtering = computed(() => !!query.value.trim() || uncheckedOnly.value)
const showRetired = ref(false)
const matches = (name: string) => name.toLowerCase().includes(query.value.trim().toLowerCase())

// Each top-level category followed by its sub-categories, which are titled with the parent's name.
// While searching, a category shows when its name matches (with all its products) or any product does.
const ordered = computed<Section[]>(() => {
  const all = data.value?.categories ?? []
  const nameOf = (id: string) => all.find(c => c.id === id)?.name ?? ''
  const sections = all.filter(c => !c.parentId || !all.some(p => p.id === c.parentId)).flatMap(top => [
    { ...top, title: top.name },
    ...all.filter(c => c.parentId === top.id).map(c => ({ ...c, title: t('bar.screens.products.sub-title', { parent: nameOf(top.id), name: c.name }) })),
  ])
  if (!filtering.value) return sections
  return sections.flatMap((c) => {
    const listed = uncheckedOnly.value ? c.products.filter(p => uncheckedProducts.value.has(p.id)) : c.products
    if (uncheckedOnly.value && !listed.length) return []
    if (!query.value.trim() || matches(c.title)) return [{ ...c, products: listed }]
    const products = listed.filter(p => matches(p.name))
    return products.length ? [{ ...c, products }] : []
  })
})
const current = computed(() => ordered.value.filter(c => c.active))
const retired = computed(() => ordered.value.filter(c => !c.active))
// The products in a category's sub-categories, for one with none of its own.
const inSubCategories = (c: Category) => (data.value?.categories ?? []).filter(x => x.parentId === c.id).reduce((n, x) => n + x.products.length, 0)

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
    if (c.id) {
      const was = data.value?.categories.find(x => x.id === c.id)
      await $api(`/api/bar/categories/${c.id}` as string, { method: 'PATCH', body })
      // Undo puts back what it was.
      const id = c.id
      offer(t('bar.screens.products.category-saved'), was && (async () => {
        await $api(`/api/bar/categories/${id}` as string, { method: 'PATCH', body: { name: was.name, colour: was.colour, parentId: was.parentId, ageRestricted: was.ageRestricted, usualPreset: was.usualPreset } })
        await refresh()
      }))
    }
    else {
      await $api('/api/bar/categories', { method: 'POST', body })
      toast.add({ title: t('bar.screens.products.category-saved'), color: 'success' })
    }
    category.value = null
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
    categoryEl.value?.setErrors(fieldErrors(refusal.value))
  }
}
// Retiring a category takes it and its products off the till; they stay in it, to come back with it.
async function setCategoryActive(c: Category, active: boolean) {
  try {
    await $api(`/api/bar/categories/${c.id}` as string, { method: 'PATCH', body: { active } })
    await refresh()
    const count = c.products.filter(p => p.active).length
    offer(active ? t('bar.screens.products.category-restored', { name: c.name }) : t('bar.screens.products.category-retired-toast', { name: c.name, count }), async () => {
      await $api(`/api/bar/categories/${c.id}` as string, { method: 'PATCH', body: { active: !active } })
      await refresh()
    })
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

// The row goes to its new place at once, then the server is told; a refusal puts the list back.
async function move(p: Product, to: number) {
  const home = data.value?.categories.find(c => c.products.some(x => x.id === p.id))
  const from = home?.products.findIndex(x => x.id === p.id) ?? -1
  if (!home || from < 0 || to < 0 || to >= home.products.length || from === to) return
  const next = [...home.products]
  next.splice(to, 0, next.splice(from, 1)[0]!)
  home.products = next
  try {
    await $api(`/api/bar/products/${p.id}/move` as string, { method: 'POST', body: { to } })
  }
  catch (e) {
    toast.add({ title: toRefusal(e).reason, color: 'error' })
  }
  await refresh()
}
</script>

<template>
  <PageFrame :title="t('bar.navigation.products.label')">
    <template #primary>
      <div class="flex items-center gap-2">
        <SearchToggle
          v-model="query"
          v-model:open="searching"
          :label="t('bar.screens.products.search')"
        />
        <UButton
          icon="i-lucide-plus"
          :label="t('bar.screens.products.new-product')"
          :disabled="!categoryItems.length"
          :ui="{ label: searching ? 'max-sm:sr-only' : '' }"
          @click="newProduct()"
        />
      </div>
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
        <template v-else>
          <UAlert
            v-if="uncheckedOnly"
            color="neutral"
            variant="subtle"
            icon="i-lucide-filter"
            :title="t('bar.screens.products.unchecked-only')"
            :actions="[{ label: t('bar.screens.products.show-all'), to: '/admin/modules/bar/products', color: 'neutral', variant: 'outline' }]"
          />
          <p
            v-if="filtering && !ordered.length"
            class="text-sm text-muted"
          >
            {{ query.trim() ? t('bar.screens.products.no-match') : t('bar.screens.products.all-checked') }}
          </p>
        </template>
        <div
          v-if="current.length"
          class="space-y-6"
        >
          <BarCategorySection
            v-for="c in current"
            :key="c.id"
            :category="c"
            :standard-id="standard"
            :in-sub-categories="inSubCategories(c)"
            :searching="filtering"
            @add="newProduct(c)"
            @edit="editCategory(c)"
            @active="on => setCategoryActive(c, on)"
            @move="move"
          />
        </div>
        <CollapsibleDivider
          :open="showRetired || filtering"
          :label="t('bar.screens.products.retired-categories')"
          :count="retired.length"
          @update:open="v => showRetired = v"
        >
          <div class="mt-4 space-y-6">
            <BarCategorySection
              v-for="c in retired"
              :key="c.id"
              :category="c"
              :standard-id="standard"
              :in-sub-categories="inSubCategories(c)"
              :searching="filtering"
              @edit="editCategory(c)"
              @active="on => setCategoryActive(c, on)"
              @move="move"
            />
          </div>
        </CollapsibleDivider>
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

    <BarChoices />

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
      @added="refresh()"
      @presets="refresh()"
    />
  </PageFrame>
</template>
