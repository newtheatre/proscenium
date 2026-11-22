<!-- Shown in the console and Admin to someone who holds something their sign-in is not strong enough
     to use, so a missing button or a refusal is never the first they hear of it: where to set up
     two-step sign-in, or a button to use the passkey they have. Hidden for the visit once dismissed. -->
<script setup lang="ts">
const { t } = useT()
const { viewer, refresh } = useViewer()
const { confirmItsYou } = useConfirmItsYou()
const hidden = useState('core:stronger-sign-in-hidden', () => false)
const need = computed(() => hidden.value ? undefined : viewer.value.strongerSignIn)

async function confirm() {
  if (!(await confirmItsYou('core.access.needs-strong-sign-in'))) return
  // What was held back is now allowed: the page's data and the menus are read again.
  await Promise.all([refresh(), refreshNuxtData()])
}
// The button's props type leaves out attributes; the label still reaches the button.
const closeButton = computed(() => ({ 'aria-label': t('core.two-step.banner.dismiss') }) as Record<string, string>)
</script>

<template>
  <UAlert
    v-if="need"
    color="warning"
    variant="subtle"
    icon="i-lucide-shield-alert"
    :title="need === 'set-up' ? t('core.two-step.banner.set-up') : t('core.two-step.banner.confirm')"
    :actions="need === 'set-up'
      ? [{ label: t('core.two-step.set-up'), to: TWO_STEP_SET_UP_AT, color: 'neutral', variant: 'outline', trailingIcon: 'i-lucide-arrow-right' }]
      : [{ label: t('core.two-step.banner.confirm-button'), color: 'neutral', variant: 'outline', onClick: confirm }]"
    :close="closeButton"
    orientation="horizontal"
    @update:open="hidden = true"
  />
</template>
