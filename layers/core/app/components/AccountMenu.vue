<!-- The one component every shell renders, and so the only way between them (UI-02). It lists only
     the shells the viewer is entitled to; the current one is marked, not removed, so the menu does
     not rearrange as a person moves. An audience account sees three lines (My account, Appearance,
     Sign out) and never a locked or greyed members' or console entry: those are simply not in the
     page. A signed-out visitor sees Sign in (just an icon on a phone). In a header on a phone the trigger is just the person's
     mark and the menu opens as a drawer from the bottom, with the same entries as the dropdown. -->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { CHOSEN_KEY, MODE_COOKIE_AGE } from '../../shared/appearance'
import { shellOf } from '../../shared/navigation'

defineProps<{ /** In a sidebar: fills its width, and shows only the person's mark when the sidebar is collapsed. */ block?: boolean, collapsed?: boolean }>()
const { t } = useT()
const route = useRoute()
const { viewer, has } = useViewer()
const { signOut } = useSignOut()
const colorMode = useColorMode()
// Marks the mode as the person's own choice, where the server can read it (server/middleware/appearance.ts).
const chosen = useCookie<string | null>(CHOSEN_KEY, { path: '/', maxAge: MODE_COOKIE_AGE, sameSite: 'lax' })
const { data: publicSettings } = await usePublicSettings()
const mayChoose = computed(() => publicSettings.value['core.appearance.let-people-choose']?.value !== false)

// Which shell the person is in: the address says so.
const here = computed(() => shellOf(route.path) ?? 'public')

type Entry = { label: string, icon: string, to: string, current: boolean }
const where = computed<Entry[]>(() => {
  const list: Entry[] = [
    // Tonight comes first for anyone who can work tonight (live mode's hub).
    ...(has('live') ? [{ label: t('core.menu.tonight'), icon: 'i-lucide-radio-tower', to: '/live', current: here.value === 'live' }] : []),
    { label: t('core.menu.my-account'), icon: 'i-lucide-circle-user', to: '/account', current: here.value === 'account' },
  ]
  if (has('members')) list.push({ label: viewer.value.membersName ?? t('core.menu.members'), icon: 'i-lucide-users', to: '/members', current: here.value === 'members' })
  if (has('console')) list.push({ label: t('core.menu.console'), icon: 'i-lucide-layout-dashboard', to: '/console', current: here.value === 'console' })
  if (has('admin')) list.push({ label: t('core.menu.admin'), icon: 'i-lucide-shield-check', to: '/admin', current: here.value === 'admin' })
  return list
})

const MODES = ['system', 'light', 'dark'] as const
const MODE_ICONS = { system: 'i-lucide-monitor-smartphone', light: 'i-lucide-sun', dark: 'i-lucide-moon' } as const
function choose(mode: typeof MODES[number]) {
  colorMode.preference = mode
  chosen.value = '1'
}

const items = computed<DropdownMenuItem[][]>(() => {
  const modes = MODES.map(mode => ({
    label: t(`core.menu.appearance.${mode}`),
    type: 'checkbox' as const,
    checked: colorMode.preference === mode,
    onUpdateChecked: () => choose(mode),
  }))
  return [
    where.value.map(e => ({ label: e.label, icon: e.icon, to: e.to, ...(e.current ? { trailingIcon: 'i-lucide-check', active: true, class: 'font-semibold' } : {}) })),
    ...(mayChoose.value ? [[{ label: t('core.menu.appearance'), icon: 'i-lucide-sun-moon', children: modes }]] : []),
    [{ label: t('core.menu.sign-out'), icon: 'i-lucide-log-out', onSelect: () => { void signOut() } }],
  ]
})

// The phone drawer closes when the person goes somewhere.
const drawer = ref(false)
watch(() => route.fullPath, () => { drawer.value = false })
const appearanceId = useId()
const label = computed(() => viewer.value.name ?? t('core.menu.account'))
</script>

<template>
  <template v-if="viewer.signedIn">
    <UDropdownMenu
      :items="items"
      :content="{ align: block ? 'start' : 'end', side: block ? 'top' : 'bottom' }"
    >
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-lucide-circle-user"
        :trailing-icon="collapsed ? undefined : block ? 'i-lucide-chevrons-up-down' : 'i-lucide-chevron-down'"
        :label="collapsed ? undefined : label"
        :block="block"
        :class="block ? 'justify-start' : 'max-sm:hidden'"
        :aria-label="t('core.menu.open', { name: label })"
      />
    </UDropdownMenu>
    <UDrawer
      v-if="!block"
      v-model:open="drawer"
      :title="label"
    >
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-lucide-circle-user"
        class="sm:hidden"
        :aria-label="t('core.menu.open', { name: label })"
      />
      <template #body>
        <nav
          class="flex flex-col gap-1"
          :aria-label="label"
        >
          <UButton
            v-for="entry in where"
            :key="entry.to"
            :to="entry.to"
            :icon="entry.icon"
            :label="entry.label"
            :trailing-icon="entry.current ? 'i-lucide-check' : undefined"
            :aria-current="entry.current ? 'page' : undefined"
            color="neutral"
            :variant="entry.current ? 'soft' : 'ghost'"
            size="lg"
            block
            :class="['justify-start', entry.current && 'font-semibold']"
            :ui="{ trailingIcon: 'ms-auto' }"
          />
        </nav>
        <template v-if="mayChoose">
          <USeparator class="my-3" />
          <p
            :id="appearanceId"
            class="mb-2 text-sm text-muted"
          >
            {{ t('core.menu.appearance') }}
          </p>
          <UFieldGroup
            class="w-full"
            role="group"
            :aria-labelledby="appearanceId"
          >
            <UButton
              v-for="mode in MODES"
              :key="mode"
              :icon="MODE_ICONS[mode]"
              :label="t(`core.menu.appearance.${mode}`)"
              :aria-pressed="colorMode.preference === mode"
              color="neutral"
              :variant="colorMode.preference === mode ? 'solid' : 'outline'"
              class="flex-1 justify-center"
              @click="choose(mode)"
            />
          </UFieldGroup>
        </template>
        <USeparator class="my-3" />
        <UButton
          icon="i-lucide-log-out"
          :label="t('core.menu.sign-out')"
          color="neutral"
          variant="ghost"
          size="lg"
          block
          class="justify-start"
          @click="drawer = false; signOut()"
        />
      </template>
    </UDrawer>
  </template>
  <UButton
    v-else
    :to="{ path: '/sign-in', query: { next: route.fullPath } }"
    color="neutral"
    variant="outline"
    icon="i-lucide-log-in"
    :label="t('core.menu.sign-in')"
    :ui="{ leadingIcon: 'sm:hidden', label: 'max-sm:sr-only' }"
  />
</template>
