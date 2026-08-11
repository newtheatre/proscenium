<script setup lang="ts">
interface Show {
  title: string
  subtitle: string | null
  description: string | null
  posterUrl: string | null
}

const props = defineProps<{
  show: Show
}>()

const TRUNCATE_LENGTH = 300

const isTruncated = computed(() =>
  !!props.show.description && props.show.description.length > TRUNCATE_LENGTH,
)

const truncatedDescription = computed(() => {
  if (!props.show.description) return ''
  if (!isTruncated.value) return props.show.description
  // Cut at the last space before the limit to avoid mid-word truncation
  const cut = props.show.description.substring(0, TRUNCATE_LENGTH)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > 0 ? cut.substring(0, lastSpace) : cut) + '…'
})

const fullDescriptionOpen = ref(false)
</script>

<template>
  <div class="relative overflow-hidden rounded-xl bg-elevated">
    <div class="grid md:grid-cols-3 gap-6 lg:gap-10">
      <!-- Poster -->
      <div class="aspect-3/4 overflow-hidden md:col-span-1">
        <NuxtImg
          v-if="show.posterUrl"
          :src="`/images/${show.posterUrl}`"
          :alt="show.title"
          class="h-full w-full object-cover"
          width="600"
          height="800"
        />
        <div
          v-else
          class="flex h-full w-full items-center justify-center bg-muted"
        >
          <UIcon
            name="i-lucide-theater"
            class="size-24 text-muted"
          />
        </div>
      </div>

      <!-- Content -->
      <div class="flex flex-col justify-center p-6 md:p-0 md:py-8 md:col-span-2 md:pr-8">
        <h1 class="text-3xl lg:text-4xl font-bold text-default">
          {{ show.title }}
        </h1>

        <p
          v-if="show.subtitle"
          class="mt-2 text-lg text-muted"
        >
          {{ show.subtitle }}
        </p>

        <template v-if="show.description">
          <MDC
            :value="truncatedDescription"
            class="mt-4 text-default leading-relaxed prose prose-sm max-w-none"
          />

          <UButton
            v-if="isTruncated"
            label="Show more…"
            variant="link"
            size="sm"
            class="mt-1 self-start"
            @click="() => { fullDescriptionOpen = true }"
          />
        </template>

        <div class="mt-6">
          <slot name="actions" />
        </div>
      </div>
    </div>

    <!-- Full description modal -->
    <UModal
      v-model:open="fullDescriptionOpen"
      :title="show.title"
      description="Full description"
    >
      <template #body>
        <MDC
          v-if="show.description"
          :value="show.description"
          class="prose prose-sm max-w-none"
        />
      </template>
      <template #footer>
        <UButton
          label="Close"
          variant="soft"
          @click="() => { fullDescriptionOpen = false }"
        />
      </template>
    </UModal>
  </div>
</template>
