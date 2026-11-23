<!-- "Set up <module>": what to do next after a module is switched on, drawn on its page. The steps come
     from what the module already declares: the Worker secrets and credentials it needs (ticked once
     set; one saved per record, such as a payment provider's key, only while a record in use lacks it)
     and its pages of settings and set-up screens, each a link to its tab, ticked once opened. It
     shows on the module's first screen and About for a week after the module is switched on, or
     until the person hides it; on a phone it starts folded to its count. -->
<script setup lang="ts">
import type { ModuleTabView, ModuleView } from '../utils/modules'
import { resolveEntry } from '../../shared/navigation'

const props = defineProps<{ view: ModuleView, tabs: ModuleTabView[] }>()
const { t, te } = useT()
const { nameOf } = useModuleWords()

const WEEK = 7 * 24 * 60 * 60 * 1000 // not-policy: how long after switching on the card is offered
const key = computed(() => `module-setup-hidden:${props.view.id}:${props.view.changedAt ?? 0}`)
const hidden = ref(false)
onMounted(() => {
  try {
    hidden.value = localStorage.getItem(key.value) === '1'
  }
  catch { /* private window: the card shows */ }
})
function hide() {
  hidden.value = true
  try {
    localStorage.setItem(key.value, '1')
  }
  catch { /* nothing to remember it in */ }
}

// A set-up screen is ticked once it has been opened, remembered on this device like the hiding.
const route = useRoute()
const seenKey = computed(() => `module-setup-seen:${props.view.id}:${props.view.changedAt ?? 0}`)
const seen = ref<string[]>([])
const here = computed(() => resolveEntry(props.tabs, route.path)?.id)
function markSeen() {
  if (!here.value || seen.value.includes(here.value)) return
  seen.value = [...seen.value, here.value]
  try {
    localStorage.setItem(seenKey.value, JSON.stringify(seen.value))
  }
  catch { /* nothing to remember it in */ }
}
onMounted(() => {
  try {
    seen.value = JSON.parse(localStorage.getItem(seenKey.value) ?? '[]') as string[]
  }
  catch { /* private window: nothing is ticked */ }
  markSeen()
  // On a phone the card starts folded to its count, so the screen below it is not pushed off.
  open.value = !window.matchMedia('(max-width: 639px)').matches // not-policy: Tailwind's sm breakpoint
})
watch(here, markSeen)
const open = ref(true)

interface Step { id: string, label: string, done: boolean, to?: string, code?: string }
const steps = computed<Step[]>(() => [
  ...props.view.secrets.filter(s => s.needed !== 'optional').map(s => ({ id: `secret:${s.name}`, label: t('core.modules.setup.secret'), code: s.name, done: s.set })),
  ...props.view.credentials.filter(c => c.step !== null).map(c => ({ id: `credential:${c.name}`, label: t('core.modules.setup.credential', { name: c.name }), done: !!c.step })),
  ...props.tabs.filter(tab => !tab.id.startsWith('core.modules.about.')).map(tab => ({
    id: tab.id,
    // The module's own page of settings is checked; any other screen is something to set up.
    label: tab.label === 'core.modules.tab.settings' ? t('core.modules.setup.settings') : t('core.modules.setup.open', { tab: te(tab.label) ? t(tab.label) : tab.label }),
    done: seen.value.includes(tab.id),
    to: tab.to,
  })),
])
const doneCount = computed(() => steps.value.filter(s => s.done).length)
// Switched on within the week, not an always-on module, something to do, and on the module's first
// screen or About: not above every tab.
const atHome = computed(() => here.value === props.tabs[0]?.id || here.value?.startsWith('core.modules.about.'))
const shown = computed(() => props.view.on && !props.view.alwaysOn && !hidden.value && steps.value.length > 0 && atHome.value
  && props.view.changedAt !== null && Date.now() - props.view.changedAt < WEEK)
</script>

<template>
  <UCard
    v-if="shown"
    :ui="{ body: 'space-y-3' }"
  >
    <div class="flex items-start justify-between gap-3">
      <UButton
        color="neutral"
        variant="link"
        class="-ms-2.5 text-start"
        :aria-expanded="open"
        :trailing-icon="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        @click="open = !open"
      >
        <span>
          <span class="block font-semibold text-highlighted">{{ t('core.modules.setup.title', { module: nameOf(view.id) }) }}</span>
          <span class="block text-sm font-normal text-muted">{{ t('core.modules.setup.progress', { done: doneCount, total: steps.length }) }}</span>
        </span>
      </UButton>
      <UButton
        :label="t('core.modules.setup.hide')"
        color="neutral"
        variant="ghost"
        size="sm"
        @click="hide"
      />
    </div>
    <ul
      v-if="open"
      class="space-y-2 text-sm"
    >
      <li
        v-for="step in steps"
        :key="step.id"
        class="flex items-start gap-2"
      >
        <UIcon
          :name="step.done ? 'i-lucide-circle-check' : 'i-lucide-circle-dashed'"
          :class="step.done ? 'text-success' : 'text-muted'"
          class="mt-0.5 size-4 shrink-0"
        />
        <span class="sr-only">{{ step.done ? t('core.modules.setup.done') : t('core.modules.setup.to-do') }}</span>
        <NuxtLink
          v-if="step.to"
          :to="step.to"
          class="text-highlighted hover:underline"
        >
          {{ step.label }}
        </NuxtLink>
        <span v-else>
          {{ step.label }}
          <code
            v-if="step.code"
            class="ms-1 rounded bg-elevated px-1 py-0.5 text-xs break-all"
          >{{ step.code }}</code>
        </span>
      </li>
    </ul>
  </UCard>
</template>
