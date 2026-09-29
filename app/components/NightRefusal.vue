<script setup lang="ts">
import { whoCanHelpTonight } from '#shared/utils/night-hub'

// A refused show-night screen: where you stand, who can help tonight by first name, and the way
// back, with none of the refused screen's controls left to press (issue 1304, E-111 criterion 5).
defineProps<{ says: string }>()

interface TeamMember { role: string, filled: boolean, name: string | null }

const request = useRequestFetch()

// Tonight's team answers any of the three roles; somebody with none reads the job instead. In the
// served page, so the line names the duty manager from the first paint (issue 1521).
const team = ref<TeamMember[] | null>(null)
useServedRead('night-refusal-team', () => settleRead(() => request<{ performances: { team: TeamMember[] }[] }>('/api/tonight/team')), (answered) => {
  if (answered.kind === 'READ') team.value = answered.value.performances.flatMap(one => one.team)
})
</script>

<template>
  <div
    class="space-y-4 rounded-xl bg-elevated p-4 ring-1 ring-default"
    data-test="night-refusal"
  >
    <UIcon
      name="i-lucide-lock"
      class="size-8 text-muted"
    />
    <p class="text-base">
      {{ says }}
    </p>
    <p
      class="font-semibold"
      data-test="night-refusal-help"
    >
      {{ whoCanHelpTonight(team) }}
    </p>
    <div class="flex flex-col gap-3">
      <UButton
        to="/tonight"
        size="xl"
        block
        icon="i-lucide-arrow-left"
        class="min-h-12"
        data-test="night-refusal-back"
      >
        Back to tonight
      </UButton>
      <UButton
        to="/rota"
        color="neutral"
        variant="subtle"
        size="xl"
        block
        icon="i-lucide-calendar-days"
        class="min-h-12"
        data-test="night-refusal-rota"
      >
        My rota
      </UButton>
    </div>
  </div>
</template>
