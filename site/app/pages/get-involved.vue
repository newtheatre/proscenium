<!-- Get involved: a landing page rather than a reading column. Everything on it comes from the front
     matter of site/content/pages/get-involved.md (headline, sticker, the two buttons, departments and
     steps), so the committee changes words there and never here. Any body text under the front
     matter is shown below. -->
<script setup lang="ts">
interface Link { label: string, to: string }
interface Meta {
  banner?: string
  headline?: string
  flash?: string
  join?: Link
  more?: Link
  departments?: { title: string, icon?: string, blurb: string }[]
  steps?: { title: string, blurb: string }[]
}
const { data: page } = await useAsyncData('page:/get-involved', () => queryCollection('pages').path('/get-involved').first())
if (!page.value) throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })
useSeoMeta({ title: page.value.title, description: page.value.description })
const meta = computed(() => (page.value?.meta ?? {}) as Meta)
const departments = computed(() => meta.value.departments ?? [])
const steps = computed(() => meta.value.steps ?? [])
const prose = computed(() => (page.value?.body?.value?.length ?? 0) > 0)
const external = (to: string) => (/^https:/.test(to) ? '_blank' : undefined)
</script>

<template>
  <div v-if="page">
    <NntHero
      :src="meta.banner ?? null"
      :title="meta.headline ?? page.title"
      :description="page.description"
      align="start"
    >
      <template
        v-if="meta.flash"
        #headline
      >
        <span class="nnt-sticker inline-block px-4 py-1.5 text-sm">{{ meta.flash }}</span>
      </template>
      <template
        v-if="meta.join || meta.more"
        #links
      >
        <UButton
          v-if="meta.join"
          :to="meta.join.to"
          :target="external(meta.join.to)"
          :label="meta.join.label"
          size="lg"
          class="nnt-button-marquee"
        />
        <UButton
          v-if="meta.more"
          :to="meta.more.to"
          :target="external(meta.more.to)"
          :label="meta.more.label"
          size="lg"
          class="nnt-button-poster"
        />
      </template>
    </NntHero>

    <UContainer class="py-16">
      <section v-if="departments.length">
        <h2 class="nnt-headline text-3xl text-highlighted sm:text-4xl">
          Pick your department <span class="text-lg font-normal text-muted">(or several)</span>
        </h2>
        <ul class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <li
            v-for="d in departments"
            :key="d.title"
            class="nnt-ticket rounded-lg bg-elevated p-5"
          >
            <UIcon
              v-if="d.icon"
              :name="d.icon"
              class="size-6 text-primary"
            />
            <h3 class="mt-3 font-semibold text-highlighted">
              {{ d.title }}
            </h3>
            <p class="mt-2 text-sm text-muted">
              {{ d.blurb }}
            </p>
          </li>
        </ul>
      </section>

      <section
        v-if="steps.length"
        class="mt-16"
      >
        <h2 class="sr-only">
          How to start
        </h2>
        <ol class="grid gap-4 sm:grid-cols-3">
          <li
            v-for="(s, i) in steps"
            :key="s.title"
            class="rounded-lg bg-elevated p-5 ring-1 ring-default"
          >
            <p class="font-mono text-xs text-primary">
              {{ String(i + 1).padStart(2, '0') }}
            </p>
            <h3 class="mt-3 font-semibold text-highlighted">
              {{ s.title }}
            </h3>
            <p class="mt-2 text-sm text-muted">
              {{ s.blurb }}
            </p>
          </li>
        </ol>
      </section>

      <UPageBody
        v-if="prose"
        class="mt-16 max-w-prose"
      >
        <ContentRenderer :value="page" />
      </UPageBody>
    </UContainer>
  </div>
</template>
