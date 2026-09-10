<script setup lang="ts">
// Operator documentation, one page per module, signed in only: it names permissions, thresholds
// and internal screens that have no reason to be on the public site (J-109).
definePageMeta({ middleware: 'signed-in' })

const route = useRoute()
const toast = useToast()

const { data: page } = await useAsyncData(`docs:${route.path}`, () => queryCollection('docs').path(route.path).first())

if (!page.value) {
  throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })
}

const reporting = ref(false)

async function reportDrift(): Promise<void> {
  reporting.value = true
  try {
    await $fetch('/api/docs/report-drift', { method: 'POST', body: { path: route.path } })
    toast.add({
      title: 'Reported',
      description: 'The IT Manager has been told this page needs a look.',
      icon: 'i-lucide-check',
      color: 'success',
    })
  }
  finally {
    reporting.value = false
  }
}

useSeoMeta({
  title: page.value.title,
  description: page.value.description,
})
</script>

<template>
  <div>
    <UPageHero
      :title="page!.title"
      :description="page!.description"
    />

    <UContainer class="pb-16">
      <div class="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center gap-3 text-sm text-muted">
          <UBadge
            color="neutral"
            variant="subtle"
          >
            {{ page!.module }}
          </UBadge>
          <span>Last updated {{ page!.updatedOn }} by {{ page!.updatedBy }}</span>
        </div>
        <UButton
          data-test="report-drift"
          color="neutral"
          variant="subtle"
          icon="i-lucide-flag"
          :loading="reporting"
          @click="reportDrift"
        >
          Report this page as out of date
        </UButton>
      </div>

      <ContentRenderer :value="page!" />
    </UContainer>
  </div>
</template>
