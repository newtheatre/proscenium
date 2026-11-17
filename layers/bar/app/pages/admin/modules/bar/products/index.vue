<!-- Products (S11): the bar's categories, in till order, each with its products and their Standard
     prices. A product opens its own page for its sizes and prices on every list. Products move up and
     down within their category by button, so the keyboard can reorder them too. -->
<script setup lang="ts">
interface VariantPrice { listId: string, amountMinor: number | null }
interface Variant { id: string, name: string, active: boolean, prices: VariantPrice[] }
interface Product { id: string, name: string, ageRestricted: boolean, active: boolean, variants: Variant[] }
interface Category { id: string, name: string, colour: string | null, active: boolean, products: Product[] }
interface List { id: string, standard: boolean }

const { t } = useT()
const { $api } = useNuxtApp()
const { money } = await useMoney()
const { toRefusal } = useRefusal()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<{ categories: Category[], lists: List[] }>('/api/bar/catalogue', { key: 'bar:catalogue' })

const standard = computed(() => data.value?.lists.find(l => l.standard)?.id)
const COLOURS = ['primary', 'secondary', 'success', 'info', 'warning', 'error', 'neutral'] as const
const colourItems = computed(() => [{ value: 'none', label: t('bar.screens.products.colour-none') }, ...COLOURS.map(c => ({ value: c, label: t(`bar.screens.colours.${c}`) }))])

// One line of a product: each size on sale with its Standard price.
function line(p: Product): string {
  const sizes = p.variants.filter(v => v.active).map((v) => {
    const price = v.prices.find(x => x.listId === standard.value)?.amountMinor
    const shown = price === null || price === undefined ? t('bar.screens.products.no-price') : money(price)
    return p.variants.length === 1 && v.name === 'Each' ? shown : `${v.name} ${shown}`
  })
  return [sizes.join(' · '), p.ageRestricted ? t('bar.screens.products.age-restricted') : null].filter(Boolean).join(' · ')
}

// A category: new, or renamed, recoloured or retired.
const category = ref<{ id: string | null, name: string, colour: string } | null>(null)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
function editCategory(c?: Category) {
  refusal.value = null
  category.value = c ? { id: c.id, name: c.name, colour: c.colour ?? 'none' } : { id: null, name: '', colour: 'none' }
}
async function saveCategory() {
  const c = category.value!
  refusal.value = null
  try {
    const body = { name: c.name, colour: c.colour === 'none' ? null : c.colour }
    if (c.id) await $api(`/api/bar/categories/${c.id}` as string, { method: 'PATCH', body })
    else await $api('/api/bar/categories', { method: 'POST', body })
    toast.add({ title: t('bar.screens.products.category-saved'), color: 'success' })
    category.value = null
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
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

// A new product: its category, name, whether it needs an age check, and its first size's Standard price.
const product = ref<{ categoryId: string, name: string, ageRestricted: boolean, variantName: string, amountMinor: number | null } | null>(null)
const categoryItems = computed(() => (data.value?.categories ?? []).filter(c => c.active).map(c => ({ value: c.id, label: c.name })))
function newProduct(c?: Category) {
  refusal.value = null
  product.value = { categoryId: c?.id ?? categoryItems.value[0]?.value ?? '', name: '', ageRestricted: false, variantName: '', amountMinor: null }
}
async function saveProduct() {
  refusal.value = null
  try {
    const made = await $api<{ productId: string }>('/api/bar/products', { method: 'POST', body: { ...product.value, variantName: product.value!.variantName || undefined } })
    product.value = null
    await navigateTo(`/admin/modules/bar/products/${made.productId}`)
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
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
          v-for="c in data.categories"
          :key="c.id"
          :title="c.name"
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
          :state="category"
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
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="bar-category"
          :label="t('bar.screens.save')"
        />
      </template>
    </UModal>

    <UModal
      :open="!!product"
      :title="t('bar.screens.products.new-product')"
      @update:open="v => { if (!v) product = null }"
    >
      <template #body>
        <UForm
          v-if="product"
          id="bar-product"
          :state="product"
          class="space-y-4"
          novalidate
          @submit="saveProduct"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            :label="t('bar.screens.products.category')"
            name="categoryId"
            required
          >
            <USelect
              v-model="product.categoryId"
              :items="categoryItems"
            />
          </UFormField>
          <UFormField
            :label="t('bar.screens.products.name')"
            :help="t('bar.screens.products.name-help')"
            name="name"
            required
          >
            <UInput v-model="product.name" />
          </UFormField>
          <UFormField
            :label="t('bar.screens.products.first-size')"
            :help="t('bar.screens.products.first-size-help')"
            name="variantName"
          >
            <UInput v-model="product.variantName" />
          </UFormField>
          <UFormField
            :label="t('bar.screens.products.standard-price')"
            :help="t('bar.screens.products.standard-price-help')"
            name="amountMinor"
          >
            <FieldMoney v-model="product.amountMinor" />
          </UFormField>
          <UCheckbox
            v-model="product.ageRestricted"
            :label="t('bar.screens.products.age-check')"
            :description="t('bar.screens.products.age-check-help')"
          />
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="bar-product"
          :label="t('bar.screens.products.create')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
