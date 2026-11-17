<script setup lang="ts">
// What the audience is told before they come (C-10, C-53): who the production is for, the staging
// effects the room will use, and the content warnings, each graded by how much of the topic the show
// holds. Effects and age are always shown on the public page; content warnings sit behind a "show".
type Level = 'mentioned' | 'discussed' | 'depicted'
interface Heading { id: string, label: string }
interface Warning { id: string, label: string, description: string | null, groupId: string | null, retired: boolean }
interface EffectOption { id: string, label: string, description: string | null, icon: string | null, retired: boolean }
interface Guidance {
  ageMin: number | null
  ageRestricted: boolean
  effectsConfirmedNone: boolean
  advisoriesConfirmedNone: boolean
  advisories: { termId: string, level: Level, levelAssumed: boolean, detail: string | null }[]
  effects: { termId: string, detail: string | null }[]
}
interface Options { advisories: Warning[], advisoryGroups: Heading[], effects: EffectOption[] }

const props = defineProps<{ productionId: string, production: Guidance, options: Options }>()
const emit = defineEmits<{ changed: [] }>()

const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const toast = useToast()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const base = computed(() => `/api/core/productions/${props.productionId}`)

async function run(fn: () => Promise<unknown>, done: string) {
  refusal.value = null
  try {
    await fn()
    emit('changed')
    toast.add({ title: done, color: 'success' })
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

// ---- Age
const NO_AGE = -1
const ages = [{ value: NO_AGE, label: 'No age set' }, ...Array.from({ length: 22 }, (_, n) => ({ value: n, label: n === 0 ? 'All ages' : `${n} and over` }))]
const KINDS = [{ value: 'recommendation', label: 'A recommendation' }, { value: 'restriction', label: 'A restriction: nobody younger is admitted' }]
const age = reactive({ min: NO_AGE, kind: 'recommendation' })
watch(() => props.production, (p) => {
  age.min = p.ageMin ?? NO_AGE
  age.kind = p.ageRestricted ? 'restriction' : 'recommendation'
}, { immediate: true, deep: true })
const saveAge = () => run(() => $api(base.value, {
  method: 'PATCH',
  body: { ageMin: age.min === NO_AGE ? null : age.min, ageRestricted: age.min !== NO_AGE && age.kind === 'restriction' },
}), 'Age saved')

// ---- Staging effects
const effectsOn = reactive<Record<string, { on: boolean, detail: string }>>({})
const effectsNone = ref(false)
watch(() => [props.production, props.options] as const, ([p, o]) => {
  for (const e of o.effects) {
    const row = p.effects.find(x => x.termId === e.id)
    effectsOn[e.id] = { on: !!row, detail: row?.detail ?? '' }
  }
  effectsNone.value = p.effectsConfirmedNone
}, { immediate: true, deep: true })
const shownEffects = computed(() => props.options.effects.filter(e => !e.retired || effectsOn[e.id]?.on))
const anyEffect = computed(() => shownEffects.value.some(e => effectsOn[e.id]?.on))
function saveEffects() {
  const list = shownEffects.value.filter(e => effectsOn[e.id]?.on).map(e => ({ termId: e.id, detail: effectsOn[e.id]!.detail.trim() || null }))
  if (!list.length && effectsNone.value !== props.production.effectsConfirmedNone)
    return run(() => $api(base.value, { method: 'PATCH', body: { effectsConfirmedNone: effectsNone.value } }), 'Staging effects saved')
  return run(() => $api(`${base.value}/effects`, { method: 'PUT', body: { effects: list } }), 'Staging effects saved')
}

// ---- Content warnings
const LEVELS = [{ value: 'mentioned', label: 'Mentioned' }, { value: 'discussed', label: 'Discussed' }, { value: 'depicted', label: 'Depicted' }]
const LEVEL_HELP = 'Mentioned: said in passing. Discussed: talked about at length. Depicted: shown on stage.'
const picked = reactive<Record<string, { on: boolean, level: Level | '', detail: string, assumed: boolean }>>({})
const warningsNone = ref(false)
const search = ref('')
watch(() => [props.production, props.options] as const, ([p, o]) => {
  for (const w of o.advisories) {
    const row = p.advisories.find(x => x.termId === w.id)
    picked[w.id] = { on: !!row, level: row && !row.levelAssumed ? row.level : '', detail: row?.detail ?? '', assumed: !!row?.levelAssumed }
  }
  warningsNone.value = p.advisoriesConfirmedNone
}, { immediate: true, deep: true })

const OTHER = '__other'
const sections = computed(() => {
  const needle = search.value.trim().toLowerCase()
  const visible = props.options.advisories.filter(w => (!w.retired || picked[w.id]?.on) && (!needle || w.label.toLowerCase().includes(needle) || picked[w.id]?.on))
  const headings = [...props.options.advisoryGroups, { id: OTHER, label: 'Other' }]
  return headings
    .map(h => ({ ...h, terms: visible.filter(w => (w.groupId ?? OTHER) === h.id) }))
    .filter(h => h.terms.length)
})
const chosen = computed(() => props.options.advisories.filter(w => picked[w.id]?.on))
const ungraded = computed(() => chosen.value.filter(w => !picked[w.id]!.level))
const setAll = ref<string | undefined>(undefined)
function applySetAll(level: string | undefined) {
  if (!level) return
  for (const w of chosen.value) picked[w.id]!.level = level as Level
  setAll.value = undefined
}
function saveWarnings() {
  if (ungraded.value.length) {
    refusal.value = toRefusal({ data: { code: 'core.production.advisory-level-needed', reason: `Give every content warning a level first: ${ungraded.value.map(w => w.label).join(', ')}.` } })
    return
  }
  const list = chosen.value.map(w => ({ termId: w.id, level: picked[w.id]!.level as Level, detail: picked[w.id]!.detail.trim() || null }))
  if (!list.length && warningsNone.value !== props.production.advisoriesConfirmedNone)
    return run(() => $api(base.value, { method: 'PATCH', body: { advisoriesConfirmedNone: warningsNone.value } }), 'Content warnings saved')
  return run(() => $api(`${base.value}/advisories`, { method: 'PUT', body: { advisories: list } }), 'Content warnings saved')
}
</script>

<template>
  <div class="space-y-4">
    <RefusalNotice :refusal="refusal" />

    <PageSection
      title="Who it is for"
      description="A minimum age shows on the production's page and on its cards. A recommendation advises; a restriction means nobody younger is admitted."
    >
      <UForm
        id="production-age"
        :state="age"
        class="grid gap-4 sm:grid-cols-2"
        @submit="saveAge"
      >
        <UFormField label="Minimum age">
          <USelectMenu
            v-model="age.min"
            :items="ages"
            value-key="value"
            :search-input="false"
          />
        </UFormField>
        <UFormField
          label="This age is"
          :help="age.min === NO_AGE ? 'Set an age first.' : undefined"
        >
          <USelect
            v-model="age.kind"
            :items="KINDS"
            :disabled="age.min === NO_AGE"
          />
        </UFormField>
      </UForm>
      <template #footer>
        <UButton
          type="submit"
          form="production-age"
          label="Save age"
          color="neutral"
          variant="outline"
        />
      </template>
    </PageSection>

    <PageSection
      title="Staging effects"
      description="What the room will do to the audience. This is safety information, so it is always shown. List the effects, or confirm there are none: publishing needs one or the other."
    >
      <UForm
        id="production-effects"
        :state="effectsOn"
        class="space-y-3"
        @submit="saveEffects"
      >
        <div
          v-for="e in shownEffects"
          :key="e.id"
          class="flex flex-wrap items-center gap-3"
        >
          <UCheckbox
            v-model="effectsOn[e.id]!.on"
            :label="e.label"
            :description="e.description ?? undefined"
            class="w-72"
          />
          <UInput
            v-if="effectsOn[e.id]!.on"
            v-model="effectsOn[e.id]!.detail"
            placeholder="Detail, such as when it happens"
            :aria-label="`Detail for ${e.label}`"
            maxlength="300"
            size="sm"
            class="flex-1"
          />
        </div>
        <UCheckbox
          v-if="!anyEffect"
          v-model="effectsNone"
          label="This production has no staging effects to warn about"
        />
      </UForm>
      <template #footer>
        <UButton
          type="submit"
          form="production-effects"
          label="Save staging effects"
          color="neutral"
          variant="outline"
        />
      </template>
    </PageSection>

    <PageSection
      title="Content warnings"
      description="What the story is about that someone may want to know first. Grade each by how much of it the show holds. They sit behind a &quot;show&quot; control on the public page, because they can spoil the plot. List them, or confirm there are none."
    >
      <UForm
        id="production-warnings"
        :state="picked"
        class="space-y-4"
        @submit="saveWarnings"
      >
        <div class="flex flex-wrap items-end gap-3">
          <UFormField
            label="Find a warning"
            class="min-w-56 flex-1"
          >
            <UInput
              v-model="search"
              icon="i-lucide-search"
              placeholder="Search the list"
            />
          </UFormField>
          <UFormField
            v-if="chosen.length > 1"
            label="Set all chosen to"
            :help="LEVEL_HELP"
          >
            <USelect
              v-model="setAll"
              :items="LEVELS"
              placeholder="Choose a level"
              @update:model-value="applySetAll"
            />
          </UFormField>
        </div>
        <UAlert
          v-if="ungraded.length"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="Some warnings have no level yet"
          :description="`Give each a level before saving: ${ungraded.map(w => w.label).join(', ')}.`"
        />
        <p
          v-if="!sections.length"
          class="text-sm text-muted"
        >
          Nothing in the list matches.
        </p>
        <section
          v-for="h in sections"
          :key="h.id"
          class="space-y-2"
        >
          <h3 class="text-sm font-semibold text-highlighted">
            {{ h.label }}
          </h3>
          <div
            v-for="w in h.terms"
            :key="w.id"
            class="flex flex-wrap items-center gap-3"
          >
            <UCheckbox
              v-model="picked[w.id]!.on"
              :label="w.label"
              :description="w.description ?? undefined"
              class="w-72"
            />
            <template v-if="picked[w.id]!.on">
              <USelect
                v-model="picked[w.id]!.level"
                :items="LEVELS"
                placeholder="Level"
                :aria-label="`Level for ${w.label}`"
                size="sm"
                class="w-36"
              />
              <UInput
                v-model="picked[w.id]!.detail"
                placeholder="Detail, such as when it happens"
                :aria-label="`Detail for ${w.label}`"
                maxlength="300"
                size="sm"
                class="min-w-48 flex-1"
              />
              <UBadge
                v-if="picked[w.id]!.assumed"
                color="warning"
                variant="subtle"
                label="Level assumed: set the real one"
              />
            </template>
          </div>
        </section>
        <UCheckbox
          v-if="!chosen.length"
          v-model="warningsNone"
          label="This production has no content warnings"
        />
      </UForm>
      <template #footer>
        <UButton
          type="submit"
          form="production-warnings"
          label="Save content warnings"
          color="neutral"
          variant="outline"
        />
      </template>
    </PageSection>
  </div>
</template>
