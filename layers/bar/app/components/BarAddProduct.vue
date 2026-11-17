<!-- Add a product (Bar specification, tab 10, approved 17 November): two steps in one window, as Add a
     run. First the kind of product, as large tiles of presets; a category with a usual preset opens
     straight on the second step. Then one form: name, category, a row per size with its Standard price
     and what percentage lists will charge, the choices it asks, and the usual settings behind one line.
     The footer saves the product, or the rows and choices as a preset for next time. -->
<script setup lang="ts">
interface PresetSize { name: string, measure: string | null }
interface Preset { id: string, builtIn: boolean, name: string | null, sizes: PresetSize[], groupIds: string[], groupNames: string[], ageRestricted: boolean | null, mixer: boolean }
interface Category { id: string, name: string, parentId: string | null, ageRestricted: boolean, usualPreset: string | null, active: boolean }
interface List { id: string, name: string, standard: boolean, percentOff: number | null, active: boolean }
interface Group { id: string, name: string, active: boolean }

// categoryId: the category it was opened from, whose usual preset it starts on.
const props = defineProps<{ categories: Category[], lists: List[], categoryId?: string }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ added: [productId: string] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const { money } = await useMoney()
const { toRefusal } = useRefusal()
const toast = useToast()

const presets = ref<Preset[]>([])
const groups = ref<Group[]>([])
const step = ref<1 | 2>(1)
const preset = ref<Preset | null>(null)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const form = ref({ name: '', categoryId: '', age: 'category' as 'category' | 'yes' | 'no', sizes: [] as { name: string, amountMinor: number | null }[], groupIds: [] as string[], mixer: false })
const showDefaults = ref(false)

const presetName = (p: Preset) => p.builtIn ? t(`bar.presets.${p.id.slice('builtin:'.length)}.name`) : p.name!
const presetHint = (p: Preset) => p.builtIn ? t(`bar.presets.${p.id.slice('builtin:'.length)}.description`) : p.sizes.map(s => s.name).join(', ')
const builtIns = computed(() => presets.value.filter(p => p.builtIn))
const own = computed(() => presets.value.filter(p => !p.builtIn))
const categoryItems = computed(() => props.categories.filter(c => c.active).map(c => ({ value: c.id, label: c.name })))
const groupItems = computed(() => groups.value.filter(g => g.active).map(g => ({ value: g.id, label: g.name })))
const category = computed(() => props.categories.find(c => c.id === form.value.categoryId))
const percentLists = computed(() => props.lists.filter(l => l.active && !l.standard && l.percentOff !== null))
const ageItems = computed(() => [
  { value: 'category', label: t('bar.screens.add-product.age-as-category', { answer: category.value?.ageRestricted ? t('bar.screens.product.age-yes') : t('bar.screens.product.age-no') }) },
  { value: 'yes', label: t('bar.screens.product.age-yes') },
  { value: 'no', label: t('bar.screens.product.age-no') },
])
// The usual settings as one sentence: "ID check (from Wine)".
const defaultsLine = computed(() => {
  const needs = form.value.age === 'category' ? !!category.value?.ageRestricted : form.value.age === 'yes'
  const where = form.value.age === 'category' ? t('bar.screens.add-product.from', { name: category.value?.name ?? '' }) : t('bar.screens.add-product.this-product')
  return `${needs ? t('bar.screens.add-product.id-check') : t('bar.screens.add-product.no-id-check')} (${where})`
})
// A percentage list rounds once, as the till does: half a penny and over goes up.
const lessPercent = (amount: number, percent: number) => Math.floor((amount * (100 - percent) + 50) / 100)

async function start(categoryId?: string) {
  refusal.value = null
  showDefaults.value = false
  const [p, g] = await Promise.all([
    $api<{ presets: Preset[] }>('/api/bar/presets'),
    $api<{ groups: Group[] }>('/api/bar/choices'),
  ])
  presets.value = p.presets
  groups.value = g.groups
  form.value = { name: '', categoryId: categoryId ?? categoryItems.value[0]?.value ?? '', age: 'category', sizes: [], groupIds: [], mixer: false }
  const usual = presets.value.find(x => x.id === category.value?.usualPreset)
  if (usual) choose(usual)
  else step.value = 1
}
function choose(p: Preset) {
  preset.value = p
  const byName = (n: string) => groups.value.find(g => g.active && g.name.toLowerCase() === n.toLowerCase())?.id
  form.value.sizes = p.sizes.map(s => ({ name: s.name, amountMinor: null }))
  form.value.groupIds = [...p.groupIds, ...p.groupNames.map(byName).filter((x): x is string => !!x)]
  form.value.mixer = p.mixer
  form.value.age = p.ageRestricted === null ? 'category' : p.ageRestricted ? 'yes' : 'no'
  step.value = 2
}
watch(open, (v) => {
  if (v) start(props.categoryId)
})

function addRow() {
  form.value.sizes.push({ name: '', amountMinor: null })
}
function removeRow(i: number) {
  form.value.sizes.splice(i, 1)
}

async function add() {
  const f = form.value
  refusal.value = null
  try {
    const made = await $api<{ productId: string }>('/api/bar/products/setup', {
      method: 'POST',
      body: { categoryId: f.categoryId, name: f.name, ageRestricted: f.age === 'category' ? null : f.age === 'yes', sizes: f.sizes.map(s => ({ name: s.name, amountMinor: s.amountMinor })), groupIds: f.groupIds, mixer: f.mixer },
    })
    open.value = false
    toast.add({ title: t('bar.screens.add-product.added', { name: f.name }), color: 'success' })
    emit('added', made.productId)
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

// Saving the rows, choices and overrides as a preset: never the name or the prices.
const saving = ref<{ name: string } | null>(null)
const saveRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
async function savePreset() {
  const f = form.value
  saveRefusal.value = null
  const measureOf = (name: string) => preset.value?.sizes.find(s => s.name === name)?.measure ?? null
  try {
    await $api('/api/bar/presets', {
      method: 'POST',
      body: { name: saving.value!.name, sizes: f.sizes.map(s => ({ name: s.name, measure: measureOf(s.name) })), groupIds: f.groupIds, ageRestricted: f.age === 'category' ? null : f.age === 'yes', mixer: f.mixer },
    })
    saving.value = null
    toast.add({ title: t('bar.screens.add-product.preset-saved'), color: 'success' })
    presets.value = (await $api<{ presets: Preset[] }>('/api/bar/presets')).presets
  }
  catch (e) {
    saveRefusal.value = toRefusal(e)
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
            <UButton
              v-for="p in own"
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
        </div>
      </div>

      <UForm
        v-else
        id="bar-add-product"
        :state="form"
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
            <USelect
              v-model="form.categoryId"
              :items="categoryItems"
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
              <UInput
                v-model="s.name"
                :aria-label="t('bar.screens.add-product.size-name', { n: i + 1 })"
                :placeholder="t('bar.screens.product.size-name')"
              />
              <div>
                <FieldMoney
                  v-model="s.amountMinor"
                  :aria-label="t('bar.screens.add-product.size-price', { n: i + 1 })"
                />
                <p
                  v-for="l in percentLists"
                  :key="l.id"
                  class="mt-1 text-xs text-muted"
                >
                  {{ s.amountMinor === null ? t('bar.screens.add-product.list-follows', { list: l.name, percent: l.percentOff! }) : t('bar.screens.add-product.list-price', { list: l.name, amount: money(lessPercent(s.amountMinor, l.percentOff!)), percent: l.percentOff! }) }}
                </p>
              </div>
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
        <UCheckbox
          v-model="form.mixer"
          :label="t('bar.screens.product.mixer-tick')"
          :description="t('bar.screens.product.mixer-help')"
        />
        <div class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-default p-3">
          <div class="text-sm">
            <p class="font-medium">
              {{ t('bar.screens.add-product.usual-settings') }}
            </p>
            <p class="text-muted">
              {{ defaultsLine }}
            </p>
          </div>
          <UButton
            color="neutral"
            variant="soft"
            :label="showDefaults ? t('bar.screens.add-product.hide') : t('bar.screens.add-product.change-here')"
            @click="showDefaults = !showDefaults"
          />
        </div>
        <UFormField
          v-if="showDefaults"
          :label="t('bar.screens.product.age-check')"
          name="age"
        >
          <USelect
            v-model="form.age"
            :items="ageItems"
          />
        </UFormField>
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
          @click="saving = { name: '' }; saveRefusal = null"
        />
        <UButton
          type="submit"
          form="bar-add-product"
          :label="t('bar.screens.add-product.add')"
        />
      </div>
    </template>
  </UModal>

  <UModal
    :open="!!saving"
    :title="t('bar.screens.add-product.save-preset')"
    :description="t('bar.screens.add-product.save-preset-help')"
    @update:open="v => { if (!v) saving = null }"
  >
    <template #body>
      <UForm
        v-if="saving"
        id="bar-save-preset"
        :state="saving"
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
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="bar-save-preset"
        :label="t('bar.screens.save')"
      />
    </template>
  </UModal>
</template>
