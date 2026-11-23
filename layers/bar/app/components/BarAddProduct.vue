<!-- Add a product (Bar specification, tab 10, approved 17 November): two steps in one window, as Add a
     run. First the kind of product, as large tiles of presets; opened from a category with a usual
     preset (its own or its parent's), it starts straight on the second step. Then one form: name,
     category, a row per size with its Standard price, the
     choices it asks, and its age check. The footer saves the product (and starts another, or closes,
     leaving the list in view), or the rows and choices as a preset for next time. The theatre's own presets can be renamed or deleted from their tiles. -->
<script setup lang="ts">
import { presetInput, presetPatch, setupInput } from '../../server/input'

interface PresetSize { name: string, measure: string | null }
interface Preset { id: string, builtIn: boolean, name: string | null, sizes: PresetSize[], groupIds: string[], groupNames: string[], ageRestricted: boolean | null, mixer: boolean }
interface Category { id: string, name: string, parentId: string | null, ageRestricted: boolean, usualPreset: string | null, active: boolean }
interface List { id: string, name: string, standard: boolean, active: boolean }
interface Group { id: string, name: string, active: boolean }
type Age = 'category' | 'yes' | 'no'

// categoryId: the category it was opened from, whose usual preset (or its parent's) it starts on.
const props = defineProps<{ categories: Category[], lists: List[], categoryId?: string }>()
const open = defineModel<boolean>('open', { required: true })
// presets: one of the theatre's presets was deleted or brought back, which can change a category.
const emit = defineEmits<{ added: [productId: string], presets: [] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const toast = useToast()
const { offer } = useUndo()

const presets = ref<Preset[]>([])
const groups = ref<Group[]>([])
const step = ref<1 | 2>(1)
const preset = ref<Preset | null>(null)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const form = ref({ name: '', categoryId: '', age: 'category' as Age, sizes: [] as { name: string, amountMinor: number | null }[], groupIds: [] as string[], mixer: false })
const formEl = useFormRef('formEl')
// Whether somebody chose the age check here, so a change of category no longer moves it.
const ageTouched = ref(false)

const presetName = (p: Preset) => p.builtIn ? t(`bar.presets.${p.id.slice('builtin:'.length)}.name`) : p.name!
const presetHint = (p: Preset) => p.builtIn ? t(`bar.presets.${p.id.slice('builtin:'.length)}.description`) : p.sizes.map(s => s.name).join(', ')
const builtIns = computed(() => presets.value.filter(p => p.builtIn))
const own = computed(() => presets.value.filter(p => !p.builtIn))
const categoryItems = computed(() => props.categories.filter(c => c.active).map(c => ({ value: c.id, label: c.name })))
const groupItems = computed(() => groups.value.filter(g => g.active).map(g => ({ value: g.id, label: g.name })))
const category = computed(() => props.categories.find(c => c.id === form.value.categoryId))
const standardName = computed(() => props.lists.find(l => l.standard)?.name ?? '')
const answer = (needed: boolean) => needed ? t('bar.screens.product.age-yes') : t('bar.screens.product.age-no')
const ageItems = computed(() => [
  { value: 'category', label: category.value ? t('bar.screens.add-product.age-as-category', { answer: answer(category.value.ageRestricted) }) : t('bar.screens.add-product.age-as-category-plain') },
  { value: 'yes', label: answer(true) },
  { value: 'no', label: answer(false) },
])

/** A category's usual preset, or its parent's when it has none of its own. */
function usualOf(c: Category | undefined): string | null {
  if (!c) return null
  return c.usualPreset ?? props.categories.find(p => p.id === c.parentId)?.usualPreset ?? null
}
/** The preset's age check where it differs from the category's; otherwise the product follows the category. */
function ageFor(p: Preset | null): Age {
  if (!p || p.ageRestricted === null) return 'category'
  if (category.value && p.ageRestricted === category.value.ageRestricted) return 'category'
  return p.ageRestricted ? 'yes' : 'no'
}

// usual: whether a category's usual preset opens straight on the form (not when adding another).
async function start(categoryId?: string, usual = true) {
  refusal.value = null
  confirmUnpriced.value = false
  ageTouched.value = false
  const [p, g] = await Promise.all([
    $api<{ presets: Preset[] }>('/api/bar/presets'),
    $api<{ groups: Group[] }>('/api/bar/choices'),
  ])
  presets.value = p.presets
  groups.value = g.groups
  // From the page's own button: no category yet, and always the kinds of product first.
  form.value = { name: '', categoryId: categoryId ?? '', age: 'category', sizes: [], groupIds: [], mixer: false }
  preset.value = null
  const opening = usual && categoryId ? presets.value.find(x => x.id === usualOf(category.value)) : undefined
  if (opening) choose(opening)
  else step.value = 1
}
function choose(p: Preset) {
  preset.value = p
  const byName = (n: string) => groups.value.find(g => g.active && g.name.toLowerCase() === n.toLowerCase())?.id
  form.value.sizes = p.sizes.map(s => ({ name: s.name, amountMinor: null }))
  form.value.groupIds = [...p.groupIds, ...p.groupNames.map(byName).filter((x): x is string => !!x)]
  form.value.mixer = p.mixer
  form.value.age = ageFor(p)
  ageTouched.value = false
  confirmUnpriced.value = false
  step.value = 2
}
watch(open, (v) => {
  if (v) start(props.categoryId)
})
watch(() => form.value.categoryId, () => {
  if (!ageTouched.value) form.value.age = ageFor(preset.value)
})

function addRow() {
  form.value.sizes.push({ name: '', amountMinor: null })
}
function removeRow(i: number) {
  form.value.sizes.splice(i, 1)
}

// A size left without a Standard price cannot be sold. Say so beside it, and add only once confirmed.
const unpriced = computed(() => form.value.sizes.filter(s => s.amountMinor === null && s.name.trim()))
const confirmUnpriced = ref(false)
watch(() => unpriced.value.map(s => s.name).join(), () => {
  confirmUnpriced.value = false
})

const body = () => {
  const f = form.value
  return { categoryId: f.categoryId, name: f.name, ageRestricted: f.age === 'category' ? null : f.age === 'yes', sizes: f.sizes.map(s => ({ name: s.name, amountMinor: s.amountMinor })), groupIds: f.groupIds, mixer: f.mixer }
}
const validate = () => bodyErrors(setupInput, body())

// Which footer button sent the form: Add another starts again on the kinds of product, in the same category.
const another = ref(false)
async function add() {
  refusal.value = null
  if (unpriced.value.length && !confirmUnpriced.value) {
    confirmUnpriced.value = true
    return
  }
  try {
    const name = form.value.name
    const made = await $api<{ productId: string }>('/api/bar/products/setup', { method: 'POST', body: body() })
    toast.add({
      title: t('bar.screens.add-product.added', { name }),
      color: 'success',
      actions: [{ label: t('bar.screens.add-product.open'), color: 'neutral', variant: 'outline', to: `/admin/modules/bar/products/${made.productId}` }],
    })
    emit('added', made.productId)
    if (another.value) await start(form.value.categoryId || undefined, false)
    else open.value = false
  }
  catch (e) {
    refusal.value = toRefusal(e)
    formEl.value?.setErrors(fieldErrors(refusal.value))
  }
}

// Saving the rows, choices and overrides as a preset: never the name or the prices. The same window
// renames one of the theatre's own (id set).
const saving = ref<{ id: string | null, name: string } | null>(null)
const saveRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
const saveEl = useFormRef('saveEl')
const measureOf = (name: string) => preset.value?.sizes.find(s => s.name === name)?.measure ?? null
const presetBody = () => {
  const f = form.value
  return { name: saving.value!.name, sizes: f.sizes.map(s => ({ name: s.name, measure: measureOf(s.name) })), groupIds: f.groupIds, ageRestricted: f.age === 'category' ? null : f.age === 'yes', mixer: f.mixer }
}
// The sizes' problems belong to the rows behind this window: one line here says what to fix there.
function validatePreset(): FieldError[] {
  if (saving.value?.id) return bodyErrors(presetPatch, { name: saving.value.name })
  const errors = bodyErrors(presetInput, presetBody())
  const rows = errors.filter(e => e.name.startsWith('sizes'))
  return [...errors.filter(e => !e.name.startsWith('sizes')), ...(rows.length ? [{ name: 'sizes', message: t('bar.screens.add-product.preset-sizes-invalid') }] : [])]
}
function newPreset() {
  saveRefusal.value = null
  saving.value = { id: null, name: '' }
}
function renamePreset(p: Preset) {
  saveRefusal.value = null
  saving.value = { id: p.id, name: p.name ?? '' }
}
async function reloadPresets() {
  presets.value = (await $api<{ presets: Preset[] }>('/api/bar/presets')).presets
}
async function savePreset() {
  const s = saving.value!
  saveRefusal.value = null
  try {
    if (s.id) {
      const id = s.id
      const before = presets.value.find(p => p.id === id)?.name ?? ''
      await $api(`/api/bar/presets/${id}` as string, { method: 'PATCH', body: { name: s.name } })
      offer(t('bar.screens.add-product.preset-renamed', { name: s.name }), async () => {
        await $api(`/api/bar/presets/${id}` as string, { method: 'PATCH', body: { name: before } })
        await reloadPresets()
      })
    }
    else {
      await $api('/api/bar/presets', { method: 'POST', body: presetBody() })
      toast.add({ title: t('bar.screens.add-product.preset-saved'), color: 'success' })
    }
    saving.value = null
    await reloadPresets()
  }
  catch (e) {
    saveRefusal.value = toRefusal(e)
    saveEl.value?.setErrors(fieldErrors(saveRefusal.value))
  }
}
// Deleting one of the theatre's own presets. Undo brings it back, and makes it the usual preset again
// of the categories that had it.
async function deletePreset(p: Preset) {
  const usedBy = props.categories.filter(c => c.usualPreset === p.id).map(c => c.id)
  try {
    await $api(`/api/bar/presets/${p.id}` as string, { method: 'DELETE', body: {} })
    await reloadPresets()
    if (usedBy.length) emit('presets')
    offer(t('bar.screens.add-product.preset-deleted', { name: p.name ?? '' }), async () => {
      await $api(`/api/bar/presets/${p.id}` as string, { method: 'PATCH', body: { active: true } })
      for (const id of usedBy) await $api(`/api/bar/categories/${id}` as string, { method: 'PATCH', body: { usualPreset: p.id } })
      await reloadPresets()
      if (usedBy.length) emit('presets')
    })
  }
  catch (e) {
    toast.add({ title: toRefusal(e).reason, color: 'error' })
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('bar.screens.products.new-product')"
    :description="step === 1 ? t('bar.screens.add-product.step-1') : undefined"
    :ui="{ content: 'sm:max-w-3xl' }"
  >
    <template #body>
      <div
        v-if="step === 1"
        class="space-y-4"
      >
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <UButton
            v-for="p in builtIns"
            :key="p.id"
            color="neutral"
            variant="outline"
            class="h-auto flex-col items-start gap-0.5 p-3 text-start"
            @click="choose(p)"
          >
            <span class="font-semibold">{{ presetName(p) }}</span>
            <span class="text-sm font-normal text-muted">{{ presetHint(p) }}</span>
          </UButton>
        </div>
        <div
          v-if="own.length"
          class="space-y-2"
        >
          <p class="text-sm font-medium">
            {{ t('bar.screens.add-product.your-presets') }}
          </p>
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div
              v-for="p in own"
              :key="p.id"
              class="relative"
            >
              <UButton
                color="neutral"
                variant="outline"
                class="h-full w-full flex-col items-start gap-0.5 p-3 pe-10 text-start"
                @click="choose(p)"
              >
                <span class="font-semibold">{{ presetName(p) }}</span>
                <span class="text-sm font-normal text-muted">{{ presetHint(p) }}</span>
              </UButton>
              <RowActions
                class="absolute end-1 top-1"
                :label="t('bar.screens.add-product.preset-actions', { name: presetName(p) })"
                :items="[
                  { label: t('bar.screens.add-product.rename-preset'), icon: 'i-lucide-pencil', onSelect: () => renamePreset(p) },
                  { label: t('bar.screens.add-product.delete-preset'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => deletePreset(p) },
                ]"
              />
            </div>
          </div>
        </div>
      </div>

      <UForm
        v-else
        id="bar-add-product"
        ref="formEl"
        :state="form"
        :validate="validate"
        class="space-y-4"
        novalidate
        @submit="add"
      >
        <RefusalNotice :refusal="refusal" />
        <div class="flex items-center justify-between gap-2 text-sm">
          <span>{{ t('bar.screens.add-product.preset', { name: preset ? presetName(preset) : '' }) }}</span>
          <UButton
            variant="link"
            :label="t('bar.screens.add-product.change')"
            @click="step = 1"
          />
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField
            :label="t('bar.screens.products.name')"
            :help="t('bar.screens.products.name-help')"
            name="name"
            required
          >
            <UInput v-model="form.name" />
          </UFormField>
          <UFormField
            :label="t('bar.screens.products.category')"
            name="categoryId"
            required
          >
            <USelectMenu
              v-model="form.categoryId"
              :items="categoryItems"
              :placeholder="t('bar.screens.add-product.pick-category')"
              value-key="value"
            />
          </UFormField>
        </div>
        <UFormField
          :label="t('bar.screens.add-product.sizes')"
          :help="t('bar.screens.add-product.sizes-help')"
          name="sizes"
        >
          <div class="space-y-2">
            <div
              v-for="(s, i) in form.sizes"
              :key="i"
              class="grid grid-cols-[1fr_1fr_auto] items-start gap-2"
            >
              <UFormField :name="`sizes.${i}.name`">
                <UInput
                  v-model="s.name"
                  :aria-label="t('bar.screens.add-product.size-name', { n: i + 1 })"
                  :placeholder="t('bar.screens.product.size-name')"
                />
              </UFormField>
              <UFormField :name="`sizes.${i}.amountMinor`">
                <FieldMoney
                  v-model="s.amountMinor"
                  :aria-label="t('bar.screens.add-product.size-price', { n: i + 1 })"
                />
                <p
                  v-if="confirmUnpriced && s.amountMinor === null && s.name.trim()"
                  class="mt-1 text-xs text-warning"
                >
                  {{ t('bar.screens.add-product.unpriced', { size: s.name, list: standardName }) }}
                </p>
              </UFormField>
              <IconButton
                icon="i-lucide-x"
                :label="t('bar.screens.add-product.remove-size', { n: i + 1 })"
                :disabled="form.sizes.length === 1"
                @click="removeRow(i)"
              />
            </div>
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-plus"
              :label="t('bar.screens.product.add-size')"
              :disabled="form.sizes.length >= 8"
              @click="addRow"
            />
          </div>
        </UFormField>
        <UFormField
          v-if="groupItems.length"
          :label="t('bar.screens.product.choices')"
          :help="t('bar.screens.product.choices-help')"
          name="groupIds"
        >
          <USelectMenu
            v-model="form.groupIds"
            :items="groupItems"
            value-key="value"
            multiple
            :placeholder="t('bar.screens.product.no-choices')"
          />
        </UFormField>
        <UFormField
          :label="t('bar.screens.product.age-check')"
          :help="t('bar.screens.add-product.age-help')"
          name="ageRestricted"
        >
          <USelect
            v-model="form.age"
            :items="ageItems"
            @update:model-value="ageTouched = true"
          />
        </UFormField>
        <UCheckbox
          v-model="form.mixer"
          :label="t('bar.screens.product.mixer-tick')"
          :description="t('bar.screens.product.mixer-help')"
        />
        <UAlert
          v-if="confirmUnpriced && unpriced.length"
          color="warning"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="t('bar.screens.add-product.unpriced-title', { count: unpriced.length })"
          :description="t('bar.screens.add-product.unpriced-help', { list: standardName })"
        />
      </UForm>
    </template>
    <template
      v-if="step === 2"
      #footer
    >
      <div class="flex w-full flex-wrap justify-between gap-2">
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-bookmark-plus"
          :label="t('bar.screens.add-product.save-preset')"
          @click="newPreset"
        />
        <div class="flex flex-wrap gap-2">
          <UButton
            type="submit"
            form="bar-add-product"
            color="neutral"
            variant="outline"
            :label="t('bar.screens.add-product.add-another')"
            @click="another = true"
          />
          <UButton
            type="submit"
            form="bar-add-product"
            :loading="formEl?.loading"
            :label="confirmUnpriced && unpriced.length ? t('bar.screens.add-product.add-unpriced') : t('bar.screens.add-product.add')"
            @click="another = false"
          />
        </div>
      </div>
    </template>
  </UModal>

  <UModal
    :open="!!saving"
    :title="saving?.id ? t('bar.screens.add-product.rename-preset') : t('bar.screens.add-product.save-preset')"
    :description="saving?.id ? undefined : t('bar.screens.add-product.save-preset-help')"
    @update:open="v => { if (!v) saving = null }"
  >
    <template #body>
      <UForm
        v-if="saving"
        id="bar-save-preset"
        ref="saveEl"
        :state="saving"
        :validate="validatePreset"
        class="space-y-4"
        novalidate
        @submit="savePreset"
      >
        <RefusalNotice :refusal="saveRefusal" />
        <UFormField
          :label="t('bar.screens.add-product.preset-name')"
          name="name"
          required
        >
          <UInput
            v-model="saving.name"
            maxlength="80"
            :placeholder="t('bar.screens.add-product.preset-name-placeholder')"
          />
        </UFormField>
        <UFormField name="sizes" />
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="bar-save-preset"
        :loading="saveEl?.loading"
        :label="t('bar.screens.save')"
      />
    </template>
  </UModal>
</template>
