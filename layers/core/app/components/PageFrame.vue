<!-- The frame every members' and console screen shares: one title (also the tab's title and the
     first heading), the page's one primary action, and one of three named content widths.

     In the console (and any shell built on Nuxt UI's dashboard) the page owns its panel: the title
     and primary action sit in the panel's navbar and stay put as the page scrolls, `toolbar` is the
     bar under it (a list's filters) and `footer` the bar at the foot (a form's buttons). In the
     public and members' shells the same slots sit in the page itself. Under /account the page sits
     beside My account's menu on a laptop, and its way back to the overview shows only on a phone,
     where the menu is folded away. -->
<script setup lang="ts">
import { createReusableTemplate } from '@vueuse/core'
import { shellOf } from '../../shared/navigation'

const props = withDefaults(defineProps<{
  title: string
  /** reading (forms, settings), standard (lists, records) or full (calendars, seating plans). */
  width?: 'reading' | 'standard' | 'full'
  description?: string
  /** The parents of this page, nearest last: where it sits below a navigation entry. Drawn here and nowhere else. */
  trail?: { label: string, to: string }[]
}>(), { width: 'standard', description: undefined, trail: undefined })

defineSlots<{
  default?: () => unknown
  /** Beside the title: the record's status. */
  status?: () => unknown
  /** One primary action per view. A second competing button is a sign the page does two jobs. */
  primary?: () => unknown
  /** In place of the title's words, inside the heading (My account's greeting). Phrasing content only. */
  title?: () => unknown
  toolbar?: () => unknown
  footer?: () => unknown
}>()

const embedded = inject(EMBEDDED_FRAME, false)
const window = inject(CONSOLE_WINDOW, false)
// In the console's settings window the page behind keeps its title.
if (!window) useHead({ title: () => props.title })
const { t } = useT()
// A link to a list returns it as it was left (the same view, filters, search, sort and page).
const { recall } = useListMemory()
const parents = computed(() => (props.trail ?? []).map(c => ({ label: c.label, to: recall(c.to), active: false })))
const nearest = computed(() => parents.value.at(-1))
const dashboard = inject(DASHBOARD_SHELL, false)
const admin = inject(ADMIN_SHELL, false)
const widths = { reading: 'width-reading', standard: 'width-standard', full: 'width-full' } as const
const route = useRoute()
const account = computed(() => shellOf(route.path) === 'account')
// Beside the menu a page starts at the column's edge rather than centring in it.
const accountWidths = { reading: 'max-w-2xl', standard: 'max-w-5xl', full: '' } as const
const [DefineBody, ReuseBody] = createReusableTemplate()
</script>

<template>
  <div
    v-if="embedded"
    class="space-y-4"
  >
    <div class="flex flex-wrap items-center gap-2">
      <IconButton
        v-if="nearest"
        :to="nearest.to"
        icon="i-lucide-chevron-left"
        :label="t('core.trail.back-to', { where: nearest.label })"
        class="-ms-2"
      />
      <h2 class="text-lg font-semibold text-highlighted">
        {{ title }}
      </h2>
      <slot name="status" />
      <div class="ms-auto flex items-center gap-2">
        <slot name="primary" />
      </div>
    </div>
    <p
      v-if="description"
      class="text-sm text-muted"
    >
      {{ description }}
    </p>
    <div
      v-if="$slots.toolbar"
      class="flex flex-wrap items-center gap-2"
    >
      <slot name="toolbar" />
    </div>
    <slot />
    <div
      v-if="$slots.footer"
      class="sticky bottom-0 flex justify-end gap-2 border-t border-default bg-default py-3"
    >
      <slot name="footer" />
    </div>
  </div>

  <UDashboardPanel
    v-else-if="dashboard"
    :ui="{ root: 'h-svh' }"
  >
    <template #header>
      <UDashboardNavbar :title="title">
        <template #leading>
          <UDashboardSidebarCollapse />
          <UBadge
            v-if="admin"
            icon="i-lucide-shield-check"
            :label="t('core.admin.mark')"
            color="neutral"
            variant="subtle"
          />
          <template v-if="nearest">
            <UBreadcrumb
              :items="parents"
              :aria-label="t('core.trail.label')"
              class="max-sm:hidden"
            />
            <IconButton
              :to="nearest.to"
              icon="i-lucide-chevron-left"
              class="sm:hidden"
              :label="t('core.trail.back-to', { where: nearest.label })"
            />
          </template>
        </template>
        <template #trailing>
          <slot name="status" />
        </template>
        <template #right>
          <slot name="primary" />
          <ShellTools />
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar v-if="$slots.toolbar">
        <template #left>
          <slot name="toolbar" />
        </template>
      </UDashboardToolbar>
    </template>
    <template #body>
      <div
        class="space-y-4"
        :class="widths[width]"
      >
        <p
          v-if="description"
          class="text-sm text-muted"
        >
          {{ description }}
        </p>
        <slot />
      </div>
    </template>
    <template
      v-if="$slots.footer"
      #footer
    >
      <div class="flex shrink-0 justify-end gap-2 border-t border-default px-4 py-3 sm:px-6">
        <slot name="footer" />
      </div>
    </template>
  </UDashboardPanel>

  <template v-else>
    <DefineBody>
      <UPageHeader
        :title="title"
        :description="description"
      >
        <template
          v-if="nearest"
          #headline
        >
          <UButton
            :to="nearest.to"
            icon="i-lucide-chevron-left"
            color="neutral"
            variant="link"
            :label="nearest.label"
            :aria-label="t('core.trail.back-to', { where: nearest.label })"
            class="-ms-2.5"
            :class="account && 'lg:hidden'"
          />
        </template>
        <template
          v-if="$slots.title"
          #title
        >
          <slot name="title" />
        </template>
        <template #links>
          <slot name="primary" />
        </template>
        <slot name="status" />
      </UPageHeader>
      <div class="space-y-4 py-6">
        <slot name="toolbar" />
        <slot />
        <div
          v-if="$slots.footer"
          class="sticky bottom-0 flex justify-end gap-2 border-t border-default bg-default py-3"
        >
          <slot name="footer" />
        </div>
      </div>
    </DefineBody>
    <UContainer>
      <UPage v-if="account">
        <template #left>
          <UPageAside>
            <AccountNavigation />
          </UPageAside>
        </template>
        <div :class="accountWidths[width]">
          <ReuseBody />
        </div>
      </UPage>
      <div
        v-else
        :class="widths[width]"
      >
        <ReuseBody />
      </div>
    </UContainer>
  </template>
</template>
