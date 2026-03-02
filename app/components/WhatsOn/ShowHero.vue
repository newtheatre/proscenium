<script setup lang="ts">
interface Show {
  title: string
  subtitle: string | null
  description: string | null
  posterUrl: string | null
}

defineProps<{
  show: Show
}>()
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

        <div
          v-if="show.description"
          class="mt-4 text-default leading-relaxed prose prose-sm max-w-none"
          v-html="show.description"
        />

        <div class="mt-6">
          <slot name="actions" />
        </div>
      </div>
    </div>
  </div>
</template>
