<!-- The confirmation before a module is switched on or off (foundations part 7, Modules). On: the
     modules it will also switch on, the Worker secrets it uses and whether each is set, and the
     screens that will appear. Off: the screens that will go, that the data is kept, and the modules
     that prevent it. Closes with true only from the button that repeats the verb. -->
<script setup lang="ts">
import type { ModuleView } from '../utils/modules'

const props = defineProps<{
  module: ModuleView
  on: boolean
  /** Every module, to name the others and to know which of those that need this one are on. */
  modules: ModuleView[]
}>()
const emit = defineEmits<{ close: [confirmed: boolean] }>()
const { t } = useT()
const { nameOf, listOf, screensOf } = useModuleWords()

const byId = computed(() => new Map(props.modules.map(m => [m.id, m])))
const also = computed(() => props.module.alsoOn.map(id => byId.value.get(id) ?? { id } as ModuleView))
const secrets = computed(() => [props.module, ...also.value].flatMap(m => (m.secrets ?? []).filter(s => s.needed !== 'optional')))
const blocking = computed(() => [props.module, ...also.value].flatMap(m => m.missingSecrets ?? []))
const screens = computed(() => [props.module, ...(props.on ? also.value : [])].flatMap(m => screensOf(m)))
const shellOrder = ['console', 'live', 'admin', 'members']
const screenGroups = computed(() => {
  const groups = new Map<string, { menu: string, shell: string, items: typeof screens.value }>()
  for (const s of screens.value) {
    const g = groups.get(s.menu) ?? { menu: s.menu, shell: s.shell, items: [] }
    g.items.push(s)
    groups.set(s.menu, g)
  }
  const rank = (menu: string) => shellOrder.includes(menu) ? shellOrder.indexOf(menu) : shellOrder.length
  return [...groups.values()].sort((a, b) => rank(a.menu) - rank(b.menu))
})
const preventers = computed(() => props.module.requiredBy.filter(id => byId.value.get(id)?.on))
const blocked = computed(() => props.on ? blocking.value.length > 0 : preventers.value.length > 0)
</script>

<template>
  <UModal
    :title="t(on ? 'core.modules.dialog.on-title' : 'core.modules.dialog.off-title', { module: nameOf(module.id) })"
    :description="on ? undefined : t('core.modules.dialog.kept')"
    :close="{ onClick: () => emit('close', false) }"
  >
    <template #body>
      <div class="space-y-4 text-sm">
        <div v-if="on && also.length">
          <p>{{ t('core.modules.dialog.also-on') }}</p>
          <ul class="mt-1 list-disc ps-5">
            <li
              v-for="m in also"
              :key="m.id"
            >
              {{ nameOf(m.id) }}
            </li>
          </ul>
        </div>

        <div v-if="on && secrets.length">
          <p>{{ t('core.modules.dialog.secrets') }}</p>
          <ul class="mt-1 space-y-1">
            <li
              v-for="s in secrets"
              :key="s.name"
              class="flex items-center gap-2"
            >
              <UIcon
                :name="s.set ? 'i-lucide-circle-check' : 'i-lucide-circle-dashed'"
                :class="s.set ? 'text-success' : 'text-muted'"
                class="size-4 shrink-0"
              />
              <span class="font-mono text-xs">{{ t(s.set ? 'core.modules.dialog.secret-set' : 'core.modules.dialog.secret-unset', { name: s.name }) }}</span>
            </li>
          </ul>
        </div>

        <div>
          <template v-if="screens.length">
            <p>{{ t(on ? 'core.modules.dialog.appear' : 'core.modules.dialog.disappear') }}</p>
            <div
              v-for="g in screenGroups"
              :key="g.menu"
              class="mt-2"
            >
              <p class="font-medium text-highlighted">
                {{ t('core.modules.dialog.screens-in', { shell: g.shell }) }}
              </p>
              <ul class="mt-1 list-disc ps-5">
                <li
                  v-for="s in g.items"
                  :key="s.id"
                >
                  {{ s.label }}
                </li>
              </ul>
            </div>
          </template>
          <p v-else>
            {{ t('core.modules.dialog.no-screens') }}
          </p>
        </div>

        <UAlert
          v-if="on && blocking.length"
          color="error"
          variant="subtle"
          icon="i-lucide-key-round"
          :description="t('core.modules.dialog.secret-blocks', { names: listOf(blocking) })"
        />
        <UAlert
          v-if="!on && preventers.length"
          color="error"
          variant="subtle"
          icon="i-lucide-link"
          :description="t('core.modules.dialog.prevented', { modules: listOf(preventers.map(nameOf)), count: preventers.length })"
        />
      </div>
    </template>
    <template #footer>
      <UButton
        color="neutral"
        variant="outline"
        :label="t('core.confirm.keep')"
        @click="emit('close', false)"
      />
      <UButton
        :color="on ? undefined : 'error'"
        :label="t(on ? 'core.modules.switch-on' : 'core.modules.switch-off')"
        :disabled="blocked"
        @click="emit('close', true)"
      />
    </template>
  </UModal>
</template>
