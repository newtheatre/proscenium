<!-- "Set up <module>": what to do next after a module is switched on, drawn on its page. The steps come
     from what the module already declares: the Worker secrets and credentials it needs (ticked once
     set) and its pages of settings and set-up screens, each a link to its tab. It shows for a week
     after the module is switched on, or until the person hides it. -->
<script setup lang="ts">
import type { ModuleTabView, ModuleView } from '../utils/modules'

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

interface Step { id: string, label: string, done: boolean, to?: string }
const steps = computed<Step[]>(() => [
  ...props.view.secrets.filter(s => s.needed !== 'optional').map(s => ({ id: `secret:${s.name}`, label: t('core.modules.setup.secret', { name: s.name }), done: s.set })),
  ...props.view.credentials.filter(c => c.needed !== 'optional').map(c => ({ id: `credential:${c.name}`, label: t('core.modules.setup.credential', { name: c.name }), done: c.set })),
  ...props.tabs.filter(tab => !tab.id.startsWith('core.modules.about.')).map(tab => ({
    id: tab.id,
    label: t('core.modules.setup.open', { tab: te(tab.label) ? t(tab.label) : tab.label }),
    done: false,
    to: tab.to,
  })),
])
// Switched on within the week, not an always-on module, and something to do.
const shown = computed(() => props.view.on && !props.view.alwaysOn && !hidden.value && steps.value.length > 0
  && props.view.changedAt !== null && Date.now() - props.view.changedAt < WEEK)
</script>

<template>
  <UCard
    v-if="shown"
    :ui="{ body: 'space-y-3' }"
  >
    <div class="flex items-start justify-between gap-3">
      <div>
        <h2 class="font-semibold text-highlighted">
          {{ t('core.modules.setup.title', { module: nameOf(view.id) }) }}
        </h2>
        <p class="text-sm text-muted">
          {{ t('core.modules.setup.help') }}
        </p>
      </div>
      <UButton
        :label="t('core.modules.setup.hide')"
        color="neutral"
        variant="ghost"
        size="sm"
        @click="hide"
      />
    </div>
    <ul class="space-y-2 text-sm">
      <li
        v-for="step in steps"
        :key="step.id"
        class="flex items-center gap-2"
      >
        <UIcon
          :name="step.done ? 'i-lucide-circle-check' : 'i-lucide-circle-dashed'"
          :class="step.done ? 'text-success' : 'text-muted'"
          class="size-4 shrink-0"
        />
        <NuxtLink
          v-if="step.to"
          :to="step.to"
          class="text-highlighted hover:underline"
        >
          {{ step.label }}
        </NuxtLink>
        <span v-else>{{ step.label }}</span>
      </li>
    </ul>
  </UCard>
</template>
